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

function createAdminClientForManagerCreation(options: {
  insertedProfiles: Array<Record<string, unknown>>;
  sequence?: string[];
  membershipError?: unknown;
  profileError?: unknown;
}) {
  const authUserId = "00000000-0000-0000-0000-000000000301";
  const deleteUser = vi.fn(async (userId: string) => {
    options.sequence?.push(`deleteUser:${userId}`);
    return { data: { user: null }, error: null };
  });
  const profileDeleteEq = vi.fn(async (_column: string, value: string) => {
    options.sequence?.push(`deleteProfile:${value}`);
    return { error: null };
  });
  const profileDelete = vi.fn(() => ({
    eq: profileDeleteEq,
  }));
  const profileInsert = vi.fn((payload: Record<string, unknown>) => {
    options.sequence?.push("profileInsert");
    options.insertedProfiles.push(payload);

    return {
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: options.profileError
            ? null
            : {
                auth_user_id: payload.auth_user_id,
                email: payload.email,
                full_name: payload.full_name,
                id: "00000000-0000-0000-0000-000000000201",
                role: payload.role,
              },
          error: options.profileError ?? null,
        })),
      })),
    };
  });
  const membershipInsert = vi.fn(async () => {
    options.sequence?.push("membershipInsert");
    return { error: options.membershipError ?? null };
  });

  return {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => {
          options.sequence?.push("createUser");
          return {
            data: {
              user: {
                email: payload.email,
                id: authUserId,
              },
            },
            error: null,
          };
        }),
        deleteUser,
      },
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          delete: profileDelete,
          insert: profileInsert,
        };
      }

      if (table === "agency_memberships") {
        return {
          insert: membershipInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    deleteUser,
    membershipInsert,
    profileDeleteEq,
    profileInsert,
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

  it("normalizes padded uppercase emails before creating an agency manager", async () => {
    const insertedProfiles: Array<Record<string, unknown>> = [];
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    const adminClient = createAdminClientForManagerCreation({ insertedProfiles });
    supabaseMocks.createAdminClient.mockReturnValue(adminClient);

    const { createAgencyManager } = await import("../../lib/admin/users");

    await expect(
      createAgencyManager({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: " Manager@Example.COM ",
        fullName: " Responsable Agence ",
      }),
    ).resolves.toMatchObject({
      email: "manager@example.com",
      full_name: "Responsable Agence",
      role: "agency_manager",
    });

    expect(insertedProfiles).toEqual([
      {
        auth_user_id: "00000000-0000-0000-0000-000000000301",
        email: "manager@example.com",
        full_name: "Responsable Agence",
        role: "agency_manager",
      },
    ]);
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
      email: "manager@example.com",
      email_confirm: true,
      user_metadata: {
        full_name: "Responsable Agence",
        role: "agency_manager",
      },
    });
  });

  it("creates the auth user before profile and agency membership", async () => {
    const insertedProfiles: Array<Record<string, unknown>> = [];
    const sequence: string[] = [];
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    supabaseMocks.createAdminClient.mockReturnValue(
      createAdminClientForManagerCreation({ insertedProfiles, sequence }),
    );

    const { createAgencyManager } = await import("../../lib/admin/users");

    await createAgencyManager({
      agencyId: "00000000-0000-0000-0000-000000000101",
      email: "manager@example.com",
      fullName: "Responsable Agence",
    });

    expect(sequence).toEqual(["createUser", "profileInsert", "membershipInsert"]);
    expect(insertedProfiles[0]).toMatchObject({
      auth_user_id: "00000000-0000-0000-0000-000000000301",
    });
  });

  it("deletes the auth user when profile creation fails", async () => {
    const insertedProfiles: Array<Record<string, unknown>> = [];
    const sequence: string[] = [];
    const adminClient = createAdminClientForManagerCreation({
      insertedProfiles,
      profileError: { message: "profile failed" },
      sequence,
    });
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    supabaseMocks.createAdminClient.mockReturnValue(adminClient);

    const { createAgencyManager } = await import("../../lib/admin/users");

    await expect(
      createAgencyManager({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: "manager@example.com",
        fullName: "Responsable Agence",
      }),
    ).rejects.toThrow("Impossible de creer le responsable d'agence.");

    expect(sequence).toEqual([
      "createUser",
      "profileInsert",
      "deleteUser:00000000-0000-0000-0000-000000000301",
    ]);
    expect(adminClient.membershipInsert).not.toHaveBeenCalled();
  });

  it("deletes profile and auth user when agency membership creation fails", async () => {
    const insertedProfiles: Array<Record<string, unknown>> = [];
    const sequence: string[] = [];
    const adminClient = createAdminClientForManagerCreation({
      insertedProfiles,
      membershipError: { message: "membership failed" },
      sequence,
    });
    supabaseMocks.createServerClient.mockResolvedValue(createServerClientWithRole("hr_central"));
    supabaseMocks.createAdminClient.mockReturnValue(adminClient);

    const { createAgencyManager } = await import("../../lib/admin/users");

    await expect(
      createAgencyManager({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: "manager@example.com",
        fullName: "Responsable Agence",
      }),
    ).rejects.toThrow("Impossible de rattacher le responsable a l'agence.");

    expect(sequence).toEqual([
      "createUser",
      "profileInsert",
      "membershipInsert",
      "deleteProfile:00000000-0000-0000-0000-000000000201",
      "deleteUser:00000000-0000-0000-0000-000000000301",
    ]);
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
