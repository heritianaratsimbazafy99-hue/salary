import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const EMPLOYEE = "00000000-0000-4000-8000-0000000000c1";
const SITE = "00000000-0000-4000-8000-0000000000e1";
const NEED = "00000000-0000-4000-8000-0000000000b1";
const assignment = { assignmentId: "", employeeId: EMPLOYEE, siteId: SITE, teamId: "", startDate: "2026-10-01", endDate: "", status: "ACTIVE", revision: "" };

function serverClient(role: string) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
  };
}
const adminClient = (error: { code?: string; message?: string } | null = null) => ({ rpc: vi.fn(async () => ({ data: null, error })) });

describe("HR planning", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["client_viewer", "employee", "agency_manager"])("refuses planning writes by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { saveAssignment, confirmReplacement } = await import("../../lib/hr/planning");
    await expect(saveAssignment(assignment)).rejects.toThrow("Action non autorisee.");
    await expect(confirmReplacement({ replacementId: NEED, replacementEmployeeId: EMPLOYEE, revision: "1" })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("validates periods and requires a revision when updating", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager"));
    const { saveAssignment } = await import("../../lib/hr/planning");
    await expect(saveAssignment({ ...assignment, endDate: "2026-09-30" })).rejects.toThrow("La fin doit suivre le début.");
    await expect(saveAssignment({ ...assignment, status: "ENDED" })).rejects.toThrow(/terminée exige une date de fin/);
    await expect(saveAssignment({ ...assignment, assignmentId: NEED })).rejects.toThrow("Champs invalides.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("sends a new assignment with null optional references", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { saveAssignment } = await import("../../lib/hr/planning");
    await saveAssignment(assignment);
    expect(admin.rpc).toHaveBeenCalledWith("hr_save_assignment", expect.objectContaining({ p_assignment_id: null, p_team_id: null, p_end: null, p_revision: null, p_status: "ACTIVE" }));
  });

  it.each([
    [{ code: "PT409", message: "assignment_overlap" }, /déjà une affectation en cours/],
    [{ code: "PT409", message: "candidate_busy" }, /déjà confirmé sur un autre remplacement/],
    [{ code: "22023", message: "candidate_absent" }, /congé en attente ou approuvé/],
    [{ code: "P0002", message: "not_found" }, "Élément introuvable."],
  ] as const)("maps %o to a user message", async (error, message) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    supabaseMocks.createAdminClient.mockReturnValue(adminClient(error));
    const { confirmReplacement } = await import("../../lib/hr/planning");
    await expect(confirmReplacement({ replacementId: NEED, replacementEmployeeId: EMPLOYEE, revision: 1 })).rejects.toThrow(message);
  });

  it("asks the database for a replacement need only together with an approval", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { decideLeave } = await import("../../lib/hr/leaves");
    await expect(decideLeave({ leaveId: NEED, approve: false, decisionReason: "Non", revision: "1", replacementNeeded: true })).rejects.toThrow(/qu’à l’approbation/);
    await decideLeave({ leaveId: NEED, approve: true, decisionReason: "", revision: "1", replacementNeeded: true });
    expect(admin.rpc).toHaveBeenCalledWith("hr_decide_leave", expect.objectContaining({ p_approve: true, p_replacement_needed: true }));
  });
});
