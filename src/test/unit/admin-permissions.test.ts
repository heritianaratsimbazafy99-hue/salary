import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCanAssignAgencyManager,
  assertCanManageAgencies,
  canAssignAgencyManager,
  canManageAgencies,
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
            data: { role },
            error: null,
          })),
        })),
      })),
    })),
  };
}

function createAdminClientForManagerCreation(insertedProfiles: Array<Record<string, unknown>>) {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedProfiles.push(payload);

            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    email: payload.email,
                    full_name: payload.full_name,
                    id: "00000000-0000-0000-0000-000000000201",
                    role: payload.role,
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "agency_memberships") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
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

  it("throws a stable error when agency management is forbidden", () => {
    expect(() => assertCanManageAgencies("agency_manager")).toThrow("Action non autorisee.");
    expect(() => assertCanManageAgencies("employee")).toThrow("Action non autorisee.");
  });

  it("throws a stable error when agency manager assignment is forbidden", () => {
    expect(() => assertCanAssignAgencyManager("agency_manager")).toThrow("Action non autorisee.");
    expect(() => assertCanAssignAgencyManager("employee")).toThrow("Action non autorisee.");
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
    supabaseMocks.createAdminClient.mockReturnValue(
      createAdminClientForManagerCreation(insertedProfiles),
    );

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
        email: "manager@example.com",
        full_name: "Responsable Agence",
        role: "agency_manager",
      },
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
});
