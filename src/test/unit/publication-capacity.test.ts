import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), batch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/employees/linking", () => ({ ensureEmployeeAuthProfile: mocks.ensure }));
vi.mock("@/lib/notifications/resend-server", () => ({ EMAIL_DELIVERY_UNCONFIRMED: "EMAIL_DELIVERY_UNCONFIRMED", sendPayslipPublishedEmail: vi.fn(), sendPayslipPublishedEmails: mocks.batch }));
import { publishPayrollImport } from "@/lib/payroll/publish";

describe("publication capacity", () => {
  it("prepares 340 identities with at most eight concurrent operations and preserves recipient mapping after one failure", async () => {
    let active = 0; let maxActive = 0;
    mocks.ensure.mockImplementation(async (input) => {
      active++; maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 1)); active--;
      if (input.employeeId === "EMP-17") throw new Error("Unable to prepare account");
      return { email: input.email, fullName: input.fullName, employeeId: input.employeeId, invitationToken: `token-${input.employeeId}` };
    });
    mocks.batch.mockImplementation(async (messages) => messages.map((message: { to: string }) => ({ data: { id: message.to }, error: null })));
    const notifications = Array.from({ length: 340 }, (_, index) => ({ id: `notification-${index}`, recipient_email: `worker${index}@example.com`, resource_id: `payslip-${index}`, status: "PENDING" }));
    const records: Record<string, Array<Record<string, unknown>>> = {
      payroll_imports: [{ id: "import", agency_id: "agency", period_start: "2026-10-01", period_end: "2026-10-31", status: "READY_FOR_PREVIEW" }],
      payroll_import_rows: Array.from({ length: 340 }, (_, index) => ({ employee_id: `EMP-${index}`, employee_email: `worker${index}@example.com`, employee_name: `Worker ${index}` })),
      payslip_versions: notifications.map((row) => ({ payslip_id: row.resource_id })), notifications,
    };
    const client = { from: (table: string) => {
      let rows = records[table]; let update: Record<string, unknown> | undefined;
      const query = {
        select: () => query, order: () => query,
        eq: (key: string, value: unknown) => { if (table === "notifications" && key === "id") rows = rows.filter((row) => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
        range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
        single: async () => ({ data: rows[0], error: null }),
        update: (value: Record<string, unknown>) => { update = value; return query; },
        then: (resolve: (value: unknown) => unknown) => { if (update) rows.forEach((row) => Object.assign(row, update)); return Promise.resolve({ error: null }).then(resolve); },
      }; return query;
    }, rpc: async (name: string) => {
      if (name === "payroll_email_delivery_allowed") return { data: true, error: null };
      if (name === "publish_payroll_import_reviewed") return { data: [{ agency_id: "agency", import_id: "import", period_start: "2026-10-01", period_end: "2026-10-31", published_count: 340, status: "PUBLISHED" }], error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    } };
    const result = await publishPayrollImport({ actor: { id: "actor", role: "agency_manager", agencyId: "agency" }, fingerprint: "fingerprint", importId: "import", readSupabase: client, createWriteSupabase: () => client } as unknown as Parameters<typeof publishPayrollImport>[0]);
    expect(maxActive).toBe(8); expect(active).toBe(0);
    expect(result).toMatchObject({ emailSentCount: 339, emailFailedCount: 1, notificationCount: 340 });
    expect(notifications[17].status).toBe("FAILED");
    for (const message of mocks.batch.mock.calls[0][0]) expect(message.invitationToken).toBe(`token-EMP-${message.to.match(/worker(\d+)/)[1]}`);
  });
});
