import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCanAssignAgencyManager,
  assertCanManageAgencies,
  assertCanReadPayrollAnalytics,
  canAssignAgencyManager,
  canManageAgencies,
  canReadPayrollAnalytics,
} from "../../lib/admin/permissions";

const supabaseMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: supabaseMocks.createAdminClient,
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: supabaseMocks.createServerClient,
}));

function createServerClientWithRole(role: string) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: "00000000-0000-0000-0000-000000000101",
              role,
            },
            error: null,
          })),
        })),
      })),
    })),
  };
}

function createServerClientWithoutClaims() {
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: {} },
        error: null,
      })),
    },
    from: vi.fn(),
  };
}

function createAdminClientForManagerCreation(options: { error?: unknown; active?: boolean } = {}) {
  return {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { is_active: options.active ?? true }, error: null })) })) })) })),
    rpc: vi.fn(async () => ({ data: "00000000-0000-0000-0000-000000000201", error: options.error ?? null })),
    auth: { admin: {
      createUser: vi.fn(async () => ({ data: { user: { id: "00000000-0000-0000-0000-000000000301" } }, error: null })),
      deleteUser: vi.fn(async () => ({ error: null })),
    } },
  };
}

describe("HR admin permissions", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it("allows only HR central and super admins to manage agencies", () => {
    expect(canManageAgencies("hr_central")).toBe(true);
    expect(canManageAgencies("super_admin")).toBe(true);
    expect(canManageAgencies("agency_manager")).toBe(false);
    expect(canManageAgencies("employee")).toBe(false);
  });

  it("allows only HR central and super admins to assign agency managers", () => {
    expect(canAssignAgencyManager("hr_central")).toBe(true);
    expect(canAssignAgencyManager("super_admin")).toBe(true);
    expect(canAssignAgencyManager("agency_manager")).toBe(false);
    expect(canAssignAgencyManager("employee")).toBe(false);
  });

  it("allows only HR central and super admins to read payroll analytics", () => {
    expect(canReadPayrollAnalytics("hr_central")).toBe(true);
    expect(canReadPayrollAnalytics("super_admin")).toBe(true);
    expect(canReadPayrollAnalytics("agency_manager")).toBe(false);
    expect(canReadPayrollAnalytics("employee")).toBe(false);
  });

  it("throws a stable error when agency management is forbidden", () => {
    expect(() => assertCanManageAgencies("agency_manager")).toThrow("Action non autorisee.");
    expect(() => assertCanManageAgencies("employee")).toThrow("Action non autorisee.");
  });

  it("throws a stable error when agency manager assignment is forbidden", () => {
    expect(() => assertCanAssignAgencyManager("agency_manager")).toThrow("Action non autorisee.");
    expect(() => assertCanAssignAgencyManager("employee")).toThrow("Action non autorisee.");
  });

  it("throws a stable error when payroll analytics access is forbidden", () => {
    expect(() => assertCanReadPayrollAnalytics("agency_manager")).toThrow("Action non autorisee.");
    expect(() => assertCanReadPayrollAnalytics("employee")).toThrow("Action non autorisee.");
  });

  it("does not use service-role writes when creating an agency manager is forbidden", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("agency_manager"));

    const { createAgencyManager } = await import("../../lib/admin/users");

    await expect(
      createAgencyManager({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: "manager@example.com",
        fullName: "Responsable Agence",
      }),
    ).rejects.toThrow("Action non autorisee.");

    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([{ agency_id: "agency-id" }, [{ agency_id: "agency-id" }]])("preserves a manager assignment from either PostgREST relation shape: %j", async (membership) => {
    supabaseMocks.createServerClient.mockResolvedValueOnce(createServerClientWithRole("hr_central"));
    supabaseMocks.createServerClient.mockResolvedValueOnce({ from: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ error: null, data: [{ id: "manager", role: "agency_manager", agency_memberships: membership }] }) }) }) })) });
    const { listAgencyManagers } = await import("../../lib/admin/users");
    expect((await listAgencyManagers())[0].agency_memberships).toEqual([{ agency_id: "agency-id" }]);
  });

  it("normalizes input and atomically creates the profile, membership and audit", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const admin = createAdminClientForManagerCreation();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createAgencyManager } = await import("../../lib/admin/users");
    await createAgencyManager({ agencyId: "00000000-0000-0000-0000-000000000101", email: " Manager@Example.COM ", fullName: " Responsable Agence " });
    expect(admin.rpc).toHaveBeenCalledWith("admin_save_manager", {
      p_actor_id: "00000000-0000-0000-0000-000000000101", p_profile_id: null,
      p_auth_user_id: "00000000-0000-0000-0000-000000000301", p_email: "manager@example.com",
      p_name: "Responsable Agence", p_agency_id: "00000000-0000-0000-0000-000000000101", p_active: true,
    });
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({ email: "manager@example.com", email_confirm: true, user_metadata: { full_name: "Responsable Agence" } });
  });

  it("does not create an Auth identity for an inactive agency", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const admin = createAdminClientForManagerCreation({ active: false });
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createAgencyManager } = await import("../../lib/admin/users");
    await expect(createAgencyManager({ agencyId: "00000000-0000-0000-0000-000000000101", email: "manager@example.com", fullName: "Manager" })).rejects.toThrow("agence active");
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("removes only the newly-created Auth identity when the database transaction fails", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const admin = createAdminClientForManagerCreation({ error: { code: "P0001", message: "transaction failed" } });
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createAgencyManager } = await import("../../lib/admin/users");
    await expect(createAgencyManager({ agencyId: "00000000-0000-0000-0000-000000000101", email: "manager@example.com", fullName: "Manager" })).rejects.toThrow("Impossible de créer");
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000301");
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it("preserves the Auth identity after an ambiguous RPC transport failure", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const admin = createAdminClientForManagerCreation({ error: { message: "fetch failed", code: "" } });
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { createAgencyManager } = await import("../../lib/admin/users");
    await expect(createAgencyManager({ agencyId: "00000000-0000-0000-0000-000000000101", email: "manager@example.com", fullName: "Manager" })).rejects.toThrow("Impossible de créer");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each(["employee", "agency_manager"])("forbids every lifecycle mutation for %s before service access", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole(role));
    const { updateAgencyManager, setEmployeeAccess } = await import("../../lib/admin/users");
    const { saveAgency } = await import("../../lib/admin/agencies");
    await expect(updateAgencyManager({ id: "00000000-0000-0000-0000-000000000201", agencyId: "00000000-0000-0000-0000-000000000101", fullName: "Manager", isActive: false })).rejects.toThrow("Action non autorisee");
    await expect(setEmployeeAccess({ id: "00000000-0000-0000-0000-000000000201", isActive: false })).rejects.toThrow("Action non autorisee");
    await expect(saveAgency({ name: "Agency", code: "A" })).rejects.toThrow("Action non autorisee");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps existing manager and employee identities when deactivating", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const admin = createAdminClientForManagerCreation();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { updateAgencyManager, setEmployeeAccess } = await import("../../lib/admin/users");
    await updateAgencyManager({ id: "00000000-0000-0000-0000-000000000201", agencyId: "00000000-0000-0000-0000-000000000101", fullName: "Manager", isActive: false });
    await setEmployeeAccess({ id: "00000000-0000-0000-0000-000000000202", isActive: false });
    expect(admin.rpc).toHaveBeenCalledWith("admin_save_manager", expect.objectContaining({ p_profile_id: "00000000-0000-0000-0000-000000000201", p_active: false }));
    expect(admin.rpc).toHaveBeenCalledWith("admin_set_employee_access", expect.objectContaining({ p_employee_id: "00000000-0000-0000-0000-000000000202", p_active: false }));
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("forbids agency page access through the shared server guard", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("agency_manager"));

    const { requireCanManageAgencies } = await import("../../lib/admin/auth");

    await expect(requireCanManageAgencies()).rejects.toThrow("Action non autorisee.");
  });

  it("forbids agency manager assignment pages through the shared server guard", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("employee"));

    const { requireCanAssignAgencyManager } = await import("../../lib/admin/auth");

    await expect(requireCanAssignAgencyManager()).rejects.toThrow("Action non autorisee.");
  });

  it("forbids payroll analytics pages for agency managers through the shared server guard", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("agency_manager"));

    const { requireCanReadPayrollAnalytics } = await import("../../lib/admin/auth");

    await expect(requireCanReadPayrollAnalytics()).rejects.toThrow("Action non autorisee.");
  });

  it("forbids payroll analytics pages for employees through the shared server guard", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("employee"));

    const { requireCanReadPayrollAnalytics } = await import("../../lib/admin/auth");

    await expect(requireCanReadPayrollAnalytics()).rejects.toThrow("Action non autorisee.");
  });

  it("requires authentication before payroll analytics authorization", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithoutClaims());

    const { requireCanReadPayrollAnalytics } = await import("../../lib/admin/auth");

    await expect(requireCanReadPayrollAnalytics()).rejects.toThrow("Authentification requise.");
  });

  it("returns the current actor for authorized payroll analytics access", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));

    const { requireCanReadPayrollAnalytics } = await import("../../lib/admin/auth");

    await expect(requireCanReadPayrollAnalytics()).resolves.toEqual({
      id: "00000000-0000-0000-0000-000000000101",
      role: "hr_central",
    });
  });
});
