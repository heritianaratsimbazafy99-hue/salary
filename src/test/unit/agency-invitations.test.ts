import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env.server", () => ({ requireSupabaseServiceRoleKey: () => "test-service-secret-with-enough-entropy" }));
vi.mock("@/lib/env.public", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/notifications/resend-server", () => ({ sendHrNotificationEmail: mocks.send }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ update: mocks.update }) }) }));
import { AgencyInvitationSchema, agencyInvitationToken, processAgencyInvitationJobs, requestAgencyInvitations } from "@/lib/employees/agency-invitations";
const id = "00000000-0000-4000-8000-000000000001";
describe("autonomous agency invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mutation = { error: null, eq: () => mutation };
    mocks.update.mockReturnValue(mutation);
    mocks.rpc.mockResolvedValue({ data: { email: "worker@example.test", fullName: "Worker" }, error: null });
    mocks.send.mockResolvedValue({ data: { id: "provider-1" }, error: null });
  });
  it("keeps a stable secret token and provider key across failed delivery and retry", async () => {
    mocks.send.mockRejectedValueOnce(new Error("network"));
    expect(await processAgencyInvitationJobs([id])).toEqual({ sent: 0, failed: 1, skipped: 0, pending: 0 });
    expect(await processAgencyInvitationJobs([id])).toEqual({ sent: 1, failed: 0, skipped: 0, pending: 0 });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(mocks.send.mock.calls[1][0].idempotencyKey);
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain(agencyInvitationToken(id));
    expect(mocks.send.mock.calls[1][0].html).toContain("Vos fiches apparaîtront après leur publication");
  });
  it("sends nothing when the current SQL lifecycle check refuses the job", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await processAgencyInvitationJobs([id])).toEqual({ sent: 0, failed: 0, skipped: 1, pending: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects browser supplied agency, profile and unsupported actor before privileged calls", async () => {
    expect(AgencyInvitationSchema.safeParse({ employeeIds: [id], idempotencyKey: id, agencyId: id }).success).toBe(false);
    await expect(requestAgencyInvitations({ role: "employee", id, agencyId: id }, { employeeIds: [id], idempotencyKey: id })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("bounds synchronous work and preserves the remaining durable jobs", async () => {
    const ids = Array.from({ length: 22 }, (_, index) => `job-${index}`);
    expect(await processAgencyInvitationJobs(ids)).toEqual({ sent: 20, failed: 0, skipped: 0, pending: 2 });
    expect(mocks.send).toHaveBeenCalledTimes(20);
  });
});
