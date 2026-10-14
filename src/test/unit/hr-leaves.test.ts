import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const EMPLOYEE = "00000000-0000-4000-8000-0000000000c1";
const LEAVE = "00000000-0000-4000-8000-0000000000a1";
const request = { employeeId: EMPLOYEE, leaveType: "PAID_LEAVE", startDate: "2026-11-02", endDate: "2026-11-04", reason: "Vacances" };

function serverClient(role: string, rpc: ReturnType<typeof vi.fn> = vi.fn(async () => ({ data: [], error: null }))) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
    rpc,
  };
}
const adminClient = (error: { code?: string; message?: string } | null = null) => ({ rpc: vi.fn(async () => ({ data: null, error })) });

describe("HR leaves", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["team_manager", "client_viewer", "agency_manager"])("refuses a personal request filed by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { createLeave } = await import("../../lib/hr/leaves");
    await expect(createLeave(request)).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["client_viewer", "employee", "agency_manager"])("refuses a decision by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { decideLeave } = await import("../../lib/hr/leaves");
    await expect(decideLeave({ leaveId: LEAVE, approve: true, decisionReason: "", revision: "1" })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("validates periods and refusal reasons before calling the database", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const { createLeave, decideLeave, adjustLeaveBalance } = await import("../../lib/hr/leaves");
    await expect(createLeave({ ...request, endDate: "2026-11-01" })).rejects.toThrow("La fin doit suivre le début.");
    await expect(createLeave({ ...request, leaveType: "SICK" })).rejects.toThrow("Champs invalides.");
    await expect(decideLeave({ leaveId: LEAVE, approve: false, decisionReason: " ", revision: "1" })).rejects.toThrow("Indiquez le motif du refus.");
    await expect(adjustLeaveBalance({ employeeId: EMPLOYEE, kind: "ADJUSTMENT", days: "0", reason: "Motif", revision: "1" })).rejects.toThrow(/non nul/);
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("lets a team manager decide and passes the expected revision", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { decideLeave } = await import("../../lib/hr/leaves");
    await decideLeave({ leaveId: LEAVE, approve: true, decisionReason: "", revision: "3" });
    expect(admin.rpc).toHaveBeenCalledWith("hr_decide_leave", expect.objectContaining({ p_leave_id: LEAVE, p_approve: true, p_revision: 3 }));
  });

  it.each([
    [{ code: "22023", message: "insufficient_balance" }, "Solde de congés insuffisant."],
    [{ code: "PT409", message: "leave_overlap" }, /couvre déjà une partie/],
    [{ code: "PT409", message: "stale_revision" }, /Rechargez/],
    [{ code: "22023", message: "outside_contract" }, /comprise dans le contrat/],
    [{ code: "P0002", message: "not_found" }, "Élément introuvable."],
  ] as const)("maps %o to a user message", async (error, message) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("employee"));
    supabaseMocks.createAdminClient.mockReturnValue(adminClient(error));
    const { createLeave } = await import("../../lib/hr/leaves");
    await expect(createLeave(request)).rejects.toThrow(message);
  });

  it("reads leaves through the caller session with sanitized filters", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: LEAVE, total_count: 7 }], error: null }));
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager", rpc));
    const { listLeaves } = await import("../../lib/hr/leaves");
    await expect(listLeaves({ status: "PENDING", employeeId: "x", page: 2 })).resolves.toMatchObject({ count: 7 });
    expect(rpc).toHaveBeenCalledWith("hr_list_leaves", expect.objectContaining({ p_status: "PENDING", p_employee_id: null, p_offset: 50 }));
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });
});
