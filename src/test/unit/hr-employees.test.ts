import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const AGENCY = "00000000-0000-4000-8000-0000000000a1";
const DEPT = "00000000-0000-4000-8000-0000000000d1";
const SITE = "00000000-0000-4000-8000-0000000000e1";
const EMPLOYEE = "00000000-0000-4000-8000-0000000000c1";
const record = { jobTitle: " Conseiller ", departmentId: DEPT, siteId: SITE, teamId: "", managerProfileId: "", status: "ACTIVE", contractType: "CDI", contractStart: "2026-01-01", contractEnd: "" };

function serverClient(role: string, rpc: ReturnType<typeof vi.fn> = vi.fn(async () => ({ data: [], error: null }))) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
    rpc,
  };
}
function adminClient(result: { data?: unknown; error?: { code?: string; message?: string } | null } = {}) {
  return { rpc: vi.fn(async () => ({ data: result.data ?? EMPLOYEE, error: result.error ?? null })) };
}

describe("HR employee files", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["team_manager", "client_viewer", "agency_manager", "employee"])("refuses %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { createEmployee, savePrivateDetails, updateCnaps } = await import("../../lib/hr/employees");
    await expect(createEmployee({ ...record, agencyId: AGENCY, matricule: "M1", email: "a@example.com", fullName: "A" })).rejects.toThrow("Action non autorisee.");
    await expect(savePrivateDetails({ employeeId: EMPLOYEE, revision: 1, personalEmail: "", personalPhone: "", postalAddress: "", emergencyContact: "" })).rejects.toThrow("Action non autorisee.");
    await expect(updateCnaps({ employeeId: EMPLOYEE, revision: 1, cnapsNumber: "N", cnapsStatus: "DECLARED" })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("normalizes a new file and maps empty optional references to null", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createEmployee } = await import("../../lib/hr/employees");
    await expect(createEmployee({ ...record, agencyId: AGENCY, matricule: " M1 ", email: " A@Example.com ", fullName: " Aina " })).resolves.toBe(EMPLOYEE);
    expect(admin.rpc).toHaveBeenCalledWith("hr_create_employee", expect.objectContaining({
      p_matricule: "M1", p_email: "a@example.com", p_full_name: "Aina", p_job_title: "Conseiller", p_team_id: null, p_manager_profile_id: null, p_contract_end: null,
    }));
  });

  it("rejects invalid contracts and statuses before calling the database", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    supabaseMocks.createAdminClient.mockReturnValue(adminClient());
    const { saveEmployeeRecord, updateCnaps } = await import("../../lib/hr/employees");
    await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, contractType: "CDD" })).rejects.toThrow(/CDD exige une date de fin/);
    await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, contractEnd: "2025-12-31" })).rejects.toThrow(/postérieure au début/);
    await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, contractStart: "2026-02-30" })).rejects.toThrow("Champs invalides.");
    await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, status: "ARCHIVED" })).rejects.toThrow("Champs invalides.");
    await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, contractType: "INTERIM", contractEnd: "2025-12-31" })).rejects.toThrow(/postérieure au début/);
    await expect(updateCnaps({ employeeId: EMPLOYEE, revision: 1, cnapsNumber: "", cnapsStatus: "DECLARED" })).rejects.toThrow(/numéro CNAPS est obligatoire/);
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["INTERIM", "MISSION"])("accepts an open-ended %s contract", async (contractType) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { saveEmployeeRecord } = await import("../../lib/hr/employees");
    await saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 1, contractType });
    expect(admin.rpc).toHaveBeenCalledWith("hr_save_employee_record", expect.objectContaining({ p_contract_type: contractType, p_contract_end: null }));
  });

  it("translates database refusals without exposing internals", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("super_admin"));
    const { saveEmployeeRecord } = await import("../../lib/hr/employees");
    for (const [error, message] of [
      [{ code: "PT409", message: "stale_revision" }, /Rechargez/],
      [{ code: "22023", message: "invalid_manager" }, /manager RH actif/],
      [{ code: "23505", message: "duplicate key value violates unique constraint" }, /matricule ou cet email existe déjà/],
      [{ code: "XX000", message: "internal detail" }, /^Impossible d’enregistrer le dossier\.$/],
    ] as const) {
      supabaseMocks.createAdminClient.mockReturnValue(adminClient({ error }));
      await expect(saveEmployeeRecord({ ...record, employeeId: EMPLOYEE, revision: 2 })).rejects.toThrow(message);
    }
  });

  it("queries the scoped directory with the caller session and sanitized filters", async () => {
    const rpc = vi.fn(async () => ({ data: [{ employee_id: EMPLOYEE, total_count: 31 }], error: null }));
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager", rpc));
    const { listDirectory } = await import("../../lib/hr/employees");
    await expect(listDirectory({ search: "  Rakoto ", siteId: "not-a-uuid", status: "UNKNOWN", page: 2 })).resolves.toMatchObject({ count: 31 });
    expect(rpc).toHaveBeenCalledWith("hr_employee_directory", expect.objectContaining({ p_search: "Rakoto", p_site_id: null, p_status: null, p_limit: 25, p_offset: 25 }));
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("serves the own-file page only to employees", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("team_manager"));
    const { getOwnEmployeeFiles } = await import("../../lib/hr/employees");
    await expect(getOwnEmployeeFiles()).rejects.toThrow("Action non autorisee.");
  });
});
