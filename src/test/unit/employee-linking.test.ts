import { beforeEach, describe, expect, it, vi } from "vitest";

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const INVITED_BY_PROFILE_ID = "00000000-0000-0000-0000-000000000401";

type EmployeeProvisioningTestClient = {
  auth: {
    admin: {
      createUser: ReturnType<typeof vi.fn>;
      deleteUser: ReturnType<typeof vi.fn>;
    };
  };
  from: (table: string) => Record<string, unknown>;
};

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

describe("ensureEmployeeAuthProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    employeeLinkingMocks.createAdminClient.mockReset();
  });

  it("creates a pending invitation instead of confirmed auth access during publication", async () => {
    const client = createEmployeeProvisioningClient();

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");
    const result = await ensureEmployeeAuthProfile(
      {
        agencyId: AGENCY_ID,
        email: "worker@example.com",
        employeeId: "EMP-001",
        fullName: "Worker One",
        invitedByProfileId: INVITED_BY_PROFILE_ID,
      },
      client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
    );

    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(tableWithUpsert(client, "employee_invitations").upsert).toHaveBeenCalled();
    expect(tableWithUpsert(client, "employees").upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        email: "worker@example.com",
        employee_id: "EMP-001",
        full_name: "Worker One",
        is_active: true,
        profile_id: null,
      }),
      expect.anything(),
    );
    expect(result.profileId).toBeNull();
  });

  it("does not bind an existing employee profile by email during publication", async () => {
    const client = createEmployeeProvisioningClientWithExistingProfile({
      authUserId: "00000000-0000-0000-0000-000000000301",
      profileId: "00000000-0000-0000-0000-000000000201",
    });

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");
    await ensureEmployeeAuthProfile(
      {
        agencyId: AGENCY_ID,
        email: "worker@example.com",
        employeeId: "EMP-001",
        fullName: "Worker One",
        invitedByProfileId: INVITED_BY_PROFILE_ID,
      },
      client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
    );

    expect(tableWithUpsert(client, "employees").upsert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: null }),
      expect.anything(),
    );
  });

  it("refreshes the pending invitation expiry when publication refreshes access", async () => {
    const client = createEmployeeProvisioningClient();

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");
    await ensureEmployeeAuthProfile(
      {
        agencyId: AGENCY_ID,
        email: "worker@example.com",
        employeeId: "EMP-001",
        fullName: "Worker One",
        invitedByProfileId: INVITED_BY_PROFILE_ID,
      },
      client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
    );

    const invitationPayload = tableWithUpsert(client, "employee_invitations").upsert.mock
      .calls[0][0] as Record<string, unknown>;

    expect(invitationPayload.expires_at).toEqual(expect.any(String));
    expect(new Date(invitationPayload.expires_at as string).getTime()).toBeGreaterThan(
      Date.now() + 13 * 24 * 60 * 60 * 1000,
    );
  });

  it("does not revoke a pre-existing pending invitation during publication rollback", async () => {
    const client = createEmployeeProvisioningClient({
      existingInvitation: {
        id: "00000000-0000-0000-0000-000000000501",
      },
    });

    const { ensureEmployeeAuthProfile, rollbackEmployeeAuthProfileProvisioning } = await import(
      "@/lib/employees/linking"
    );
    const provisioned = await ensureEmployeeAuthProfile(
      {
        agencyId: AGENCY_ID,
        email: "worker@example.com",
        employeeId: "EMP-001",
        fullName: "Worker One",
        invitedByProfileId: INVITED_BY_PROFILE_ID,
      },
      client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
    );
    tableWithUpdate(client, "employee_invitations").update.mockClear();

    await rollbackEmployeeAuthProfileProvisioning(
      client as unknown as Parameters<typeof rollbackEmployeeAuthProfileProvisioning>[0],
      provisioned,
    );

    expect(tableWithUpdate(client, "employee_invitations").update).not.toHaveBeenCalled();
  });

  it("keeps the existing pending invitation token hash during publication refresh", async () => {
    const existingTokenHash = "existing-token-hash";
    const client = createEmployeeProvisioningClient({
      existingInvitation: {
        id: "00000000-0000-0000-0000-000000000501",
        token_hash: existingTokenHash,
      },
    });

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");
    await ensureEmployeeAuthProfile(
      {
        agencyId: AGENCY_ID,
        email: "worker@example.com",
        employeeId: "EMP-001",
        fullName: "Worker One",
        invitedByProfileId: INVITED_BY_PROFILE_ID,
      },
      client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
    );

    expect(tableWithUpsert(client, "employee_invitations").upsert).not.toHaveBeenCalled();
    expect(tableWithUpdate(client, "employee_invitations").update).toHaveBeenCalledWith(
      expect.not.objectContaining({ token_hash: expect.anything() }),
    );
  });

  it("deletes the upserted employee row when invitation creation fails for a new employee", async () => {
    const client = createEmployeeProvisioningClient({
      invitationUpsertError: { message: "invitation insert failed" },
    });

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");

    await expect(
      ensureEmployeeAuthProfile(
        {
          agencyId: AGENCY_ID,
          email: "worker@example.com",
          employeeId: "EMP-001",
          fullName: "Worker One",
          invitedByProfileId: INVITED_BY_PROFILE_ID,
        },
        client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
      ),
    ).rejects.toThrow("Impossible de creer l'invitation salarie.");

    expect(tableWithDelete(client, "employees").delete).toHaveBeenCalled();
    expect(tableWithDelete(client, "profiles").delete).not.toHaveBeenCalled();
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("restores the previous employee row when invitation creation fails after refresh", async () => {
    const previousEmployee = {
      email: "old-worker@example.com",
      employee_id: "EMP-001",
      full_name: "Old Worker",
      is_active: false,
      profile_id: null,
    };
    const client = createEmployeeProvisioningClient({
      existingEmployee: previousEmployee,
      invitationUpsertError: { message: "invitation refresh failed" },
    });

    const { ensureEmployeeAuthProfile } = await import("@/lib/employees/linking");

    await expect(
      ensureEmployeeAuthProfile(
        {
          agencyId: AGENCY_ID,
          email: "worker@example.com",
          employeeId: "EMP-001",
          fullName: "Worker One",
          invitedByProfileId: INVITED_BY_PROFILE_ID,
        },
        client as unknown as Parameters<typeof ensureEmployeeAuthProfile>[1],
      ),
    ).rejects.toThrow("Impossible de creer l'invitation salarie.");

    expect(tableWithUpdate(client, "employees").update).toHaveBeenCalledWith({
      email: previousEmployee.email,
      employee_id: previousEmployee.employee_id,
      full_name: previousEmployee.full_name,
      is_active: previousEmployee.is_active,
      profile_id: previousEmployee.profile_id,
    });
    expect(tableWithDelete(client, "profiles").delete).not.toHaveBeenCalled();
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
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

function createEmployeeProvisioningClientWithExistingProfile(input: {
  authUserId: string;
  profileId: string;
}) {
  return createEmployeeProvisioningClient({
    profileByEmail: {
      auth_user_id: input.authUserId,
      id: input.profileId,
      role: "employee",
    },
  });
}

function createEmployeeProvisioningClient(options: {
  existingEmployee?: Record<string, unknown> | null;
  existingInvitation?: Record<string, unknown> | null;
  invitationUpsertError?: unknown;
  profileByEmail?: Record<string, unknown> | null;
} = {}): EmployeeProvisioningTestClient {
  const authUserId = "00000000-0000-0000-0000-000000000301";
  const profileId = "00000000-0000-0000-0000-000000000201";
  const employeeSelectEq = vi.fn(() => employeeSelectQuery);
  const employeeSelectQuery = {
    eq: employeeSelectEq,
    maybeSingle: vi.fn(async () => ({
      data: options.existingEmployee ?? null,
      error: null,
    })),
  };
  const employeeUpsert = vi.fn((payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          email: payload.email,
          employee_id: payload.employee_id,
          full_name: payload.full_name,
          is_active: payload.is_active,
          profile_id: payload.profile_id,
        },
        error: null,
      })),
    })),
  }));
  const employeesTable = {
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
    select: vi.fn(() => employeeSelectQuery),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
    upsert: employeeUpsert,
  };

  const profileSelectEq = vi.fn(() => profileSelectQuery);
  const profileSelectQuery = {
    eq: profileSelectEq,
    maybeSingle: vi.fn(async () => ({
      data: options.profileByEmail ?? null,
      error: null,
    })),
  };
  const profilesTable = {
    delete: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
    insert: vi.fn((payload: Record<string, unknown>) => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            auth_user_id: payload.auth_user_id,
            email: payload.email,
            full_name: payload.full_name,
            id: profileId,
            role: payload.role,
          },
          error: null,
        })),
      })),
    })),
    select: vi.fn(() => profileSelectQuery),
  };

  const invitationSelectEq = vi.fn(() => invitationSelectQuery);
  const invitationSelectQuery = {
    eq: invitationSelectEq,
    maybeSingle: vi.fn(async () => ({
      data: options.existingInvitation ?? null,
      error: null,
    })),
  };
  const invitationUpsert = vi.fn((payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: options.invitationUpsertError
          ? null
          : {
              ...payload,
              id: options.existingInvitation?.id ?? "00000000-0000-0000-0000-000000000501",
            },
        error: options.invitationUpsertError ?? null,
      })),
    })),
  }));
  const invitationUpdate = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              ...options.existingInvitation,
              ...payload,
              id: options.existingInvitation?.id ?? "00000000-0000-0000-0000-000000000501",
            },
            error: null,
          })),
        })),
      })),
    })),
  }));
  const employeeInvitationsTable = {
    select: vi.fn(() => invitationSelectQuery),
    update: invitationUpdate,
    upsert: invitationUpsert,
  };

  return {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => ({
          data: {
            user: {
              email: payload.email,
              id: authUserId,
            },
          },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    },
    from: vi.fn((table: string) => {
      if (table === "employee_invitations") return employeeInvitationsTable;
      if (table === "employees") return employeesTable;
      if (table === "profiles") return profilesTable;

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function tableWithUpsert(client: EmployeeProvisioningTestClient, table: string) {
  return client.from(table) as { upsert: ReturnType<typeof vi.fn> };
}

function tableWithUpdate(client: EmployeeProvisioningTestClient, table: string) {
  return client.from(table) as { update: ReturnType<typeof vi.fn> };
}

function tableWithDelete(client: EmployeeProvisioningTestClient, table: string) {
  return client.from(table) as { delete: ReturnType<typeof vi.fn> };
}
