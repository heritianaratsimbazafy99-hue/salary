import { beforeEach, describe, expect, it, vi } from "vitest";

const employeeLinkingMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: employeeLinkingMocks.createAdminClient,
}));

describe("normalizeEmployeeIdentity", () => {
  it("normalizes stable employee identity", async () => {
    const { normalizeEmployeeIdentity } = await import("@/lib/employees/linking");

    expect(
      normalizeEmployeeIdentity({
        agencyId: "agency-1",
        employeeId: " emp-001 ",
        email: "USER@EXAMPLE.COM",
        fullName: " Jean   Rakoto\tAndry ",
      }),
    ).toEqual({
      agencyId: "agency-1",
      employeeId: "EMP-001",
      email: "user@example.com",
      fullName: "Jean Rakoto Andry",
    });
  });
});

describe("linkEmployeeAuthProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    employeeLinkingMocks.createAdminClient.mockReset();
  });

  it("creates an employee auth user, profile, and links employees.profile_id", async () => {
    const sequence: string[] = [];
    const client = createEmployeeLinkingClient({ sequence });
    employeeLinkingMocks.createAdminClient.mockReturnValue(client);

    const { linkEmployeeAuthProfile } = await import("@/lib/employees/linking");

    await expect(
      linkEmployeeAuthProfile({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: " Employee@Example.COM ",
        employeeId: " emp-001 ",
        fullName: " Rina  Salary ",
      }),
    ).resolves.toEqual({
      authUserId: "00000000-0000-0000-0000-000000000301",
      email: "employee@example.com",
      employeeId: "EMP-001",
      fullName: "Rina Salary",
      profileId: "00000000-0000-0000-0000-000000000201",
    });

    expect(sequence).toEqual(["createUser", "profileInsert", "employeeUpdate"]);
    expect(client.auth.admin.createUser).toHaveBeenCalledWith({
      email: "employee@example.com",
      email_confirm: true,
      user_metadata: {
        employee_id: "EMP-001",
        full_name: "Rina Salary",
        role: "employee",
      },
    });
    expect(client.insertedProfiles).toEqual([
      {
        auth_user_id: "00000000-0000-0000-0000-000000000301",
        email: "employee@example.com",
        full_name: "Rina Salary",
        role: "employee",
      },
    ]);
    expect(client.employeeUpdate).toHaveBeenCalledWith({
      email: "employee@example.com",
      full_name: "Rina Salary",
      profile_id: "00000000-0000-0000-0000-000000000201",
    });
    expect(client.employeeEq).toHaveBeenCalledWith(
      "agency_id",
      "00000000-0000-0000-0000-000000000101",
    );
    expect(client.employeeEq).toHaveBeenCalledWith("employee_id", "EMP-001");
  });

  it("rolls back the profile and auth user when employee linking fails", async () => {
    const sequence: string[] = [];
    const client = createEmployeeLinkingClient({
      employeeError: { message: "employee update failed" },
      sequence,
    });
    employeeLinkingMocks.createAdminClient.mockReturnValue(client);

    const { linkEmployeeAuthProfile } = await import("@/lib/employees/linking");

    await expect(
      linkEmployeeAuthProfile({
        agencyId: "00000000-0000-0000-0000-000000000101",
        email: "employee@example.com",
        employeeId: "EMP-001",
        fullName: "Rina Salary",
      }),
    ).rejects.toThrow("Impossible de rattacher le salarie a son compte.");

    expect(sequence).toEqual([
      "createUser",
      "profileInsert",
      "employeeUpdate",
      "deleteProfile:00000000-0000-0000-0000-000000000201",
      "deleteUser:00000000-0000-0000-0000-000000000301",
    ]);
  });
});

function createEmployeeLinkingClient(options: {
  employeeError?: unknown;
  profileError?: unknown;
  sequence: string[];
}) {
  const insertedProfiles: Array<Record<string, unknown>> = [];
  const authUserId = "00000000-0000-0000-0000-000000000301";
  const profileId = "00000000-0000-0000-0000-000000000201";
  const deleteUser = vi.fn(async (userId: string) => {
    options.sequence.push(`deleteUser:${userId}`);
    return { data: { user: null }, error: null };
  });
  const profileDeleteEq = vi.fn(async (_column: string, value: string) => {
    options.sequence.push(`deleteProfile:${value}`);
    return { error: null };
  });
  const employeeEq = vi.fn(() => employeeQuery);
  const employeeQuery = {
    eq: employeeEq,
    select: vi.fn(() => employeeQuery),
    single: vi.fn(async () => ({
      data: options.employeeError
        ? null
        : {
            email: "employee@example.com",
            employee_id: "EMP-001",
            full_name: "Rina Salary",
            profile_id: profileId,
          },
      error: options.employeeError ?? null,
    })),
  };
  const employeeUpdate = vi.fn(() => {
    options.sequence.push("employeeUpdate");
    return employeeQuery;
  });

  return {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => {
          options.sequence.push("createUser");
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
    employeeEq,
    employeeUpdate,
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          delete: vi.fn(() => ({
            eq: profileDeleteEq,
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            options.sequence.push("profileInsert");
            insertedProfiles.push(payload);

            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: options.profileError
                    ? null
                    : {
                        auth_user_id: payload.auth_user_id,
                        email: payload.email,
                        full_name: payload.full_name,
                        id: profileId,
                        role: payload.role,
                      },
                  error: options.profileError ?? null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "employees") {
        return {
          update: employeeUpdate,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    insertedProfiles,
  };
}
