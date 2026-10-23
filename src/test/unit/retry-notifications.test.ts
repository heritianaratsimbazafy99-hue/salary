import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), load: vi.fn(), markSent: vi.fn(), markFailed: vi.fn(), deliveryAllowed: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payroll/publish", () => ({
  isPayrollEmailDeliveryAllowed: mocks.deliveryAllowed, loadPublishedPayslipNotifications: mocks.load, markNotificationSent: mocks.markSent, markNotificationFailed: mocks.markFailed,
  PublishConflictError: class extends Error {}, PublishNotFoundError: class extends Error {},
}));
vi.mock("@/lib/notifications/resend-server", () => ({
  EMAIL_DELIVERY_UNCONFIRMED: "EMAIL_DELIVERY_UNCONFIRMED",
  EmailDeliveryError: class extends Error { constructor(readonly deliveryUnconfirmed = false, readonly quotaExceeded = false) { super("Provider error"); } },
  sendPayslipPublishedEmail: mocks.send,
}));
import { retryImportNotifications } from "@/lib/payroll/retry-notifications";
import { EmailDeliveryError } from "@/lib/notifications/resend-server";

function fixture(count = 1) {
  const rows: Record<string, Record<string, unknown>[]> = {
    payroll_imports: [{ id: "import", agency_id: "agency", status: "PUBLISHED" }],
    agencies: [{ id: "agency", is_active: true }],
    payslips: [{ id: "payslip", agency_id: "agency", employee_id: "00000000-0000-4000-8000-000000000101" }],
    employees: [{ id: "00000000-0000-4000-8000-000000000101", agency_id: "agency", employee_id: "EMP", profile_id: "profile", email: "worker@example.com", full_name: "Worker", is_active: true }],
    profiles: [{ id: "profile", role: "employee", is_active: true }],
  };
  const notifications = Array.from({ length: count }, (_, index) => ({ id: `notification-${index}`, resourceId: "payslip", recipientEmail: "worker@example.com", deliveryUnconfirmed: false, pending: false, sent: false }));
  mocks.load.mockImplementation(async () => notifications.filter((row) => !row.sent));
  mocks.markSent.mockImplementation(async (_admin, { notificationId }) => { notifications.find((row) => row.id === notificationId)!.sent = true; });
  const client = { from: (table: string) => {
    let selected = rows[table];
    const query = { select: () => query, eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return query; }, single: async () => ({ data: selected[0], error: null }), maybeSingle: async () => ({ data: selected[0], error: null }) }; return query;
  } };
  const createWriteSupabase = vi.fn(() => client);
  const input = { actor: { id: "manager", role: "agency_manager", agencyId: "agency" }, importId: "import", readSupabase: client, createWriteSupabase } as unknown as Parameters<typeof retryImportNotifications>[0];
  return { input, rows, notifications, createWriteSupabase };
}

beforeEach(() => { vi.resetAllMocks(); mocks.deliveryAllowed.mockResolvedValue(true); mocks.send.mockResolvedValue({ data: { id: "provider" }, error: null }); });
describe("safe manual notification recovery", () => {
  it("retries twenty definite failures, then only remaining records, without resending SENT notifications", async () => {
    const { input } = fixture(25);
    expect(await retryImportNotifications(input)).toMatchObject({ sent: 20, remaining: 5 });
    expect(await retryImportNotifications(input)).toMatchObject({ sent: 5, remaining: 0 });
    expect(await retryImportNotifications(input)).toMatchObject({ sent: 0, remaining: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(25);
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe("notification-retry/notification-0");
  });
  it("leaves the failed notification recoverable when Auth proof has moved to a new mailbox", async () => {
    const { input } = fixture(); mocks.deliveryAllowed.mockResolvedValue(false);
    expect(await retryImportNotifications(input)).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.deliveryAllowed.mockResolvedValue(true);
    expect(await retryImportNotifications(input)).toMatchObject({ sent: 1, failed: 0 });
  });
  it.each(["deliveryUnconfirmed", "pending"] as const)("never blindly retries %s delivery", async (state) => {
    const { input, notifications } = fixture(); notifications[0][state] = true;
    expect(await retryImportNotifications(input)).toMatchObject({ unconfirmed: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["inactive", "unactivated", "changed-email", "disabled-profile"])("skips %s employees using current identity", async (condition) => {
    const { input, rows } = fixture();
    if (condition === "inactive") rows.employees[0].is_active = false;
    if (condition === "unactivated") rows.employees[0].profile_id = null;
    if (condition === "changed-email") rows.employees[0].email = "changed@example.com";
    if (condition === "disabled-profile") rows.profiles[0].is_active = false;
    expect(await retryImportNotifications(input)).toMatchObject({ skipped: 1 }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["employee", "hr_central", "super_admin"])("rejects %s before privileged reads", async (role) => {
    const { input, createWriteSupabase } = fixture(); input.actor.role = role as typeof input.actor.role;
    await expect(retryImportNotifications(input)).rejects.toThrow(); expect(createWriteSupabase).not.toHaveBeenCalled();
  });
  it("rejects another agency before privileged reads", async () => {
    const { input, rows, createWriteSupabase } = fixture(); rows.payroll_imports[0].agency_id = "another";
    await expect(retryImportNotifications(input)).rejects.toThrow(); expect(createWriteSupabase).not.toHaveBeenCalled();
  });
  it("stops immediately when the daily quota is exhausted and preserves remaining failures", async () => {
    const { input } = fixture(25); mocks.send.mockRejectedValue(new EmailDeliveryError(false, true));
    expect(await retryImportNotifications(input)).toMatchObject({ failed: 1, remaining: 24, sent: 0 });
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("records uncertainty if delivery succeeds but journal persistence fails", async () => {
    const { input } = fixture(); mocks.markSent.mockRejectedValueOnce(new Error("DB unavailable"));
    expect(await retryImportNotifications(input)).toMatchObject({ unconfirmed: 1, sent: 0 });
    expect(mocks.markFailed).toHaveBeenCalledWith(expect.anything(), { notificationId: "notification-0", failureReason: "EMAIL_DELIVERY_UNCONFIRMED" });
  });
  it("stops the lot at its first uncertain delivery instead of chaining timeouts", async () => {
    const { input } = fixture(25); mocks.send.mockRejectedValue(new EmailDeliveryError(true));
    expect(await retryImportNotifications(input)).toMatchObject({ unconfirmed: 1, remaining: 24, sent: 0 });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

});
