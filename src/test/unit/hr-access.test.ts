import { beforeEach, describe, expect, it, vi } from "vitest";

import { canAdministerHrAccess, canManageHrReferential } from "../../lib/admin/permissions";
import { hrRpcErrorMessage } from "../../lib/hr/errors";
import { APP_ROLES, isHrScopedRole } from "../../lib/roles";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const AGENCY_A = "00000000-0000-4000-8000-0000000000a1";
const AGENCY_B = "00000000-0000-4000-8000-0000000000b1";
const DEPT = "00000000-0000-4000-8000-0000000000d1";
const SITE_1 = "00000000-0000-4000-8000-0000000000e1";
const SITE_2 = "00000000-0000-4000-8000-0000000000e2";
const SITE_B = "00000000-0000-4000-8000-0000000000f1";

function serverClientWithRole(role: string) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
  };
}

function adminClient(options: { rpcError?: { code?: string; message?: string } | null } = {}) {
  const rows: Record<string, { id: string; agency_id: string }[]> = {
    hr_departments: [{ id: DEPT, agency_id: AGENCY_A }],
    hr_sites: [{ id: SITE_1, agency_id: AGENCY_A }, { id: SITE_2, agency_id: AGENCY_A }, { id: SITE_B, agency_id: AGENCY_B }],
  };
  return {
    from: vi.fn((table: string) => ({ select: vi.fn(() => ({ in: vi.fn(async (_: string, ids: string[]) => ({ data: rows[table].filter((row) => ids.includes(row.id)), error: null })) })) })),
    rpc: vi.fn(async () => ({ data: "00000000-0000-0000-0000-000000000201", error: options.rpcError ?? null })),
    auth: { admin: {
      createUser: vi.fn(async () => ({ data: { user: { id: "00000000-0000-0000-0000-000000000301" } }, error: null })),
      deleteUser: vi.fn(async () => ({ error: null })),
    } },
  };
}

describe("HR roles and permissions", () => {
  it("declares the scoped HR roles next to the existing roles", () => {
    expect(APP_ROLES).toEqual(expect.arrayContaining(["agency_manager", "employee", "hr_central", "super_admin", "team_manager", "client_viewer"]));
    expect(isHrScopedRole("team_manager")).toBe(true);
    expect(isHrScopedRole("client_viewer")).toBe(true);
    expect(isHrScopedRole("hr_central")).toBe(false);
  });

  it("lets HR manage the referential but reserves HR access administration to super admins", () => {
    for (const role of APP_ROLES) {
      expect(canManageHrReferential(role)).toBe(role === "hr_central" || role === "super_admin");
      expect(canAdministerHrAccess(role)).toBe(role === "super_admin");
    }
  });

  it("maps RPC errors to messages without leaking internals", () => {
    expect(hrRpcErrorMessage({ code: "PT409" }, "x")).toMatch(/Rechargez/);
    expect(hrRpcErrorMessage({ code: "22023", message: "invalid_scope" }, "x")).toMatch(/une seule agence/);
    expect(hrRpcErrorMessage({ code: "XX000", message: "relation secret does not exist" }, "Fallback")).toBe("Fallback");
  });
});

describe("HR access administration", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["hr_central", "team_manager", "client_viewer", "agency_manager", "employee"])("refuses %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole(role));
    const { createHrAccess } = await import("../../lib/hr/access");
    await expect(createHrAccess({ email: "m@example.com", fullName: "Manager", role: "team_manager", siteIds: [SITE_1] })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("grants a team manager the department × site intersection in one RPC", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("super_admin"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createHrAccess } = await import("../../lib/hr/access");
    await createHrAccess({ email: " Manager@Example.com ", fullName: "Manager", role: "team_manager", departmentIds: [DEPT], siteIds: [SITE_1, SITE_2, SITE_1] });
    expect(admin.rpc).toHaveBeenCalledWith("admin_save_hr_access", expect.objectContaining({
      p_email: "manager@example.com", p_role: "team_manager", p_active: true, p_profile_id: null,
      p_scopes: [{ agency_id: AGENCY_A, department_id: DEPT, site_id: SITE_1 }, { agency_id: AGENCY_A, department_id: DEPT, site_id: SITE_2 }],
    }));
  });

  it("rejects a client scope with departments or sites from two agencies before creating an identity", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("super_admin"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createHrAccess } = await import("../../lib/hr/access");
    await expect(createHrAccess({ email: "c@example.com", fullName: "Client", role: "client_viewer", departmentIds: [DEPT], siteIds: [SITE_1] })).rejects.toThrow(/au moins un site, sans département/);
    await expect(createHrAccess({ email: "c@example.com", fullName: "Client", role: "client_viewer", siteIds: [SITE_1, SITE_B] })).rejects.toThrow(/une seule agence/);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("deletes the new identity only when PostgreSQL confirms the rollback", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("super_admin"));
    const rolledBack = adminClient({ rpcError: { code: "22023", message: "invalid_scope" } });
    supabaseMocks.createAdminClient.mockReturnValue(rolledBack);
    const { createHrAccess } = await import("../../lib/hr/access");
    await expect(createHrAccess({ email: "c@example.com", fullName: "Client", role: "client_viewer", siteIds: [SITE_1] })).rejects.toThrow(/Périmètre invalide/);
    expect(rolledBack.auth.admin.deleteUser).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000301");

    const ambiguous = adminClient({ rpcError: { message: "fetch failed" } });
    supabaseMocks.createAdminClient.mockReturnValue(ambiguous);
    await expect(createHrAccess({ email: "c@example.com", fullName: "Client", role: "client_viewer", siteIds: [SITE_1] })).rejects.toThrow("Impossible de créer l’accès.");
    expect(ambiguous.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("sends the expected revision when revoking access", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("super_admin"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { setHrAccessActive } = await import("../../lib/hr/access");
    await setHrAccessActive({ id: "00000000-0000-4000-8000-000000000999", isActive: false, updatedAt: "2026-10-14T09:00:00.123456+00:00" });
    expect(admin.rpc).toHaveBeenCalledWith("admin_set_hr_access_active", expect.objectContaining({ p_active: false, p_expected_updated_at: "2026-10-14T09:00:00.123456+00:00" }));
  });

  it("refuses referential writes from scoped roles before any service-role call", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("team_manager"));
    const { saveHrSite } = await import("../../lib/hr/referential");
    await expect(saveHrSite({ agencyId: AGENCY_A, name: "Site", code: "s", isActive: true })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("requires a revision when updating an existing referential item", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClientWithRole("hr_central"));
    const { saveHrSite } = await import("../../lib/hr/referential");
    await expect(saveHrSite({ id: SITE_1, agencyId: AGENCY_A, name: "Site", code: "s", isActive: true })).rejects.toThrow("Champs invalides.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe("HR audit labels", () => {
  it("describes HR actions without exposing their payload", async () => {
    const { describeAuditAction } = await import("../../components/audit/AuditLogTable");
    expect(describeAuditAction("hr_leave.approved").title).toBe("Congé ou absence");
    expect(describeAuditAction("hr_leave_balance.adjusted").title).toBe("Correction de solde de congés");
    expect(describeAuditAction("hr_document.withdrawn").tone).toBe("danger");
    expect(describeAuditAction("hr_access.revoked").title).toBe("Accès RH retiré");
    expect(describeAuditAction("hr_report.exported").title).toBe("Rapport RH");
  });
});
