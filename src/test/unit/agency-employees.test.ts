import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyCreateSchema, AgencyDepartureSchema, AgencyRequestSchema, AgencyUpdateSchema, agencyToday } from "@/lib/employees/agency-schemas";
import { canManageAgencyEmployees, canManageHrReferential } from "@/lib/admin/permissions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), hr: vi.fn(), admin: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ getCurrentAgencyScopedActor: mocks.actor, requireCanManageHrReferential: mocks.hr }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
const ID = "00000000-0000-4000-8000-000000000001";
const AGENCY = "00000000-0000-4000-8000-000000000002";
const versions = { employeeId: ID, identityRevision: 1, lifecycleRevision: 1 };
describe("agency employee management", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ id: ID, role: "agency_manager", agencyId: AGENCY }); });
  it("keeps agency employee management separate from HR capabilities", () => {
    expect(canManageAgencyEmployees({ role: "agency_manager", actorAgencyId: AGENCY, requestedAgencyId: AGENCY })).toBe(true);
    expect(canManageHrReferential("agency_manager")).toBe(false);
    for (const role of ["team_manager", "employee", "hr_central", "super_admin"] as const) expect(canManageAgencyEmployees({ role, actorAgencyId: AGENCY, requestedAgencyId: AGENCY })).toBe(false);
    expect(canManageAgencyEmployees({ role: "agency_manager", actorAgencyId: AGENCY, requestedAgencyId: ID })).toBe(false);
  });
  it("accepts a minimal creation and rejects all extra authority fields", () => {
    const input = { matricule: " m1 ", fullName: " Aina ", email: " A@Example.com " };
    expect(AgencyCreateSchema.parse(input)).toEqual({ matricule: "M1", fullName: "Aina", email: "a@example.com" });
    for (const key of ["agencyId", "isActive", "profileId", "role", "contractType"]) expect(AgencyCreateSchema.safeParse({ ...input, [key]: ID }).success).toBe(false);
  });
  it("accepts partial organization without inventing a contract", () => {
    expect(AgencyUpdateSchema.parse({ employeeId: ID, identityRevision: 1, operationalRevision: 1, fullName: "Aina", jobTitle: "", departmentId: "", siteId: "", teamId: "", reason: "Correction" })).toMatchObject({ departmentId: null, siteId: null, teamId: null });
  });
  it("rejects impossible and future departure/return dates", () => {
    for (const departedOn of ["2026-02-30", "2999-01-01"]) expect(AgencyDepartureSchema.safeParse({ ...versions, departedOn, reason: "OTHER" }).success).toBe(false);
    expect(AgencyDepartureSchema.safeParse({ ...versions, departedOn: agencyToday(), reason: "OTHER" }).success).toBe(true);
    for (const value of ["2026-02-30", "2999-01-01"]) expect(AgencyRequestSchema.safeParse({ ...versions, type: "RETURN", value, reason: "Retour salarié" }).success).toBe(false);
  });
  it("validates requested identity values by kind", () => {
    for (const [type, value] of [["EMAIL", "bad"], ["MANAGER", "other agency manager"], ["MATRICULE", ""]]) expect(AgencyRequestSchema.safeParse({ ...versions, type, value, reason: "Correction" }).success).toBe(false);
  });
  it("resolves actor and agency from session before the service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: ID, error: null })); mocks.admin.mockReturnValue({ rpc });
    const { createAgencyEmployee } = await import("@/lib/employees/agency-management");
    await expect(createAgencyEmployee({ matricule: "m1", fullName: "Aina", email: "a@example.com" })).resolves.toBe(ID);
    expect(rpc).toHaveBeenCalledWith("agency_create_employee", { p_actor_id: ID, p_agency_id: AGENCY, p_matricule: "M1", p_full_name: "Aina", p_email: "a@example.com" });
  });
  it("refuses another role before any elevated RPC", async () => {
    mocks.actor.mockResolvedValue({ id: ID, role: "team_manager", agencyId: AGENCY });
    const { createAgencyEmployee } = await import("@/lib/employees/agency-management");
    await expect(createAgencyEmployee({ matricule: "m1", fullName: "Aina", email: "a@example.com" })).rejects.toThrow("Action non autorisee."); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("surfaces concurrent edits without leaking database details", async () => {
    mocks.admin.mockReturnValue({ rpc: vi.fn(async () => ({ error: { code: "PT409", message: "stale_revision secret" } })) });
    const { departAgencyEmployee } = await import("@/lib/employees/agency-management");
    await expect(departAgencyEmployee({ ...versions, departedOn: agencyToday(), reason: "OTHER" })).rejects.toThrow("Rechargez-la");
  });
});
