import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export type EmployeeIdentityInput = {
  agencyId: string;
  employeeId: string;
  email: string;
  fullName: string;
};

export type EmployeeIdentity = EmployeeIdentityInput;

export type LinkedEmployeeAuthProfile = Omit<EmployeeIdentity, "agencyId"> & {
  authUserId: string;
  profileId: string;
};

export type ProvisionedEmployeeAuthProfile = LinkedEmployeeAuthProfile & {
  createdAuthUserId?: string;
  createdProfileId?: string;
  employeeRollback: {
    identity: EmployeeIdentity;
    previousEmployee: ExistingEmployeeRecord | null;
  };
};

type EmployeeProvisioningAdminClient = Pick<ReturnType<typeof createAdminClient>, "auth" | "from">;

type AuthUserRecord = {
  id?: unknown;
};

type ProfileRecord = {
  auth_user_id?: unknown;
  email?: unknown;
  full_name?: unknown;
  id?: unknown;
  role?: unknown;
};

type EmployeeRecord = {
  email?: unknown;
  employee_id?: unknown;
  full_name?: unknown;
  is_active?: unknown;
  profile_id?: unknown;
};

type ExistingEmployeeRecord = {
  email: string;
  employeeId: string;
  fullName: string;
  isActive: boolean;
  profileId: string | null;
};

const EmployeeIdentityInputSchema = z.object({
  agencyId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  employeeId: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  fullName: z.string().trim().min(1).max(160),
});

export function normalizeEmployeeIdentity(input: EmployeeIdentityInput): EmployeeIdentity {
  return {
    agencyId: input.agencyId,
    employeeId: input.employeeId.trim().toUpperCase(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim().replace(/\s+/g, " "),
  };
}

export async function linkEmployeeAuthProfile(
  input: EmployeeIdentityInput,
): Promise<LinkedEmployeeAuthProfile> {
  const parsedInput = EmployeeIdentityInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new Error("Champs invalides.");
  }

  const identity = normalizeEmployeeIdentity(parsedInput.data);
  const admin = createAdminClient();
  const { data: authUserData, error: authUserError } = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    user_metadata: {
      employee_id: identity.employeeId,
      full_name: identity.fullName,
      role: "employee",
    },
  });
  const authUser = authUserData.user as AuthUserRecord | null;
  const authUserId = typeof authUser?.id === "string" ? authUser.id : null;

  if (authUserError || !authUserId) {
    throw new Error("Impossible de creer le compte salarie.");
  }

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: identity.email,
      full_name: identity.fullName,
      role: "employee",
    })
    .select("id,auth_user_id,email,full_name,role")
    .single();
  const profile = profileData as ProfileRecord | null;
  const profileId = typeof profile?.id === "string" ? profile.id : null;

  if (profileError || !profileId) {
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error("Impossible de creer le profil salarie.");
  }

  const { data: employeeData, error: employeeError } = await admin
    .from("employees")
    .update({
      email: identity.email,
      full_name: identity.fullName,
      profile_id: profileId,
    })
    .eq("agency_id", identity.agencyId)
    .eq("employee_id", identity.employeeId)
    .select("employee_id,email,full_name,profile_id")
    .single();
  const employee = employeeData as EmployeeRecord | null;

  if (
    employeeError ||
    employee?.profile_id !== profileId ||
    employee.employee_id !== identity.employeeId ||
    employee.email !== identity.email ||
    employee.full_name !== identity.fullName
  ) {
    await admin.from("profiles").delete().eq("id", profileId);
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error("Impossible de rattacher le salarie a son compte.");
  }

  return {
    authUserId,
    email: identity.email,
    employeeId: identity.employeeId,
    fullName: identity.fullName,
    profileId,
  };
}

export async function ensureEmployeeAuthProfile(
  input: EmployeeIdentityInput,
  admin: EmployeeProvisioningAdminClient = createAdminClient(),
): Promise<ProvisionedEmployeeAuthProfile> {
  const parsedInput = EmployeeIdentityInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new Error("Champs invalides.");
  }

  const identity = normalizeEmployeeIdentity(parsedInput.data);
  const existingProfile = await findEmployeeProfileByEmail(admin, identity.email);
  const previousEmployee = await findExistingEmployee(admin, identity);

  if (existingProfile) {
    await upsertLinkedEmployee(admin, {
      identity,
      profileId: existingProfile.profileId,
    });

    return {
      authUserId: existingProfile.authUserId,
      email: identity.email,
      employeeRollback: {
        identity,
        previousEmployee,
      },
      employeeId: identity.employeeId,
      fullName: identity.fullName,
      profileId: existingProfile.profileId,
    };
  }

  const { data: authUserData, error: authUserError } = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    user_metadata: {
      employee_id: identity.employeeId,
      full_name: identity.fullName,
      role: "employee",
    },
  });
  const authUser = authUserData.user as AuthUserRecord | null;
  const authUserId = typeof authUser?.id === "string" ? authUser.id : null;

  if (authUserError || !authUserId) {
    throw new Error("Impossible de creer le compte salarie.");
  }

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: identity.email,
      full_name: identity.fullName,
      role: "employee",
    })
    .select("id,auth_user_id,email,full_name,role")
    .single();
  const profile = profileData as ProfileRecord | null;
  const profileId = typeof profile?.id === "string" ? profile.id : null;

  if (profileError || !profileId) {
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error("Impossible de creer le profil salarie.");
  }

  try {
    await upsertLinkedEmployee(admin, { identity, profileId });
  } catch (error) {
    await admin.from("profiles").delete().eq("id", profileId);
    await admin.auth.admin.deleteUser(authUserId);
    throw error;
  }

  return {
    authUserId,
    createdAuthUserId: authUserId,
    createdProfileId: profileId,
    email: identity.email,
    employeeRollback: {
      identity,
      previousEmployee,
    },
    employeeId: identity.employeeId,
    fullName: identity.fullName,
    profileId,
  };
}

export async function rollbackEmployeeAuthProfileProvisioning(
  admin: EmployeeProvisioningAdminClient,
  provisioned: ProvisionedEmployeeAuthProfile,
) {
  const rollback = provisioned.employeeRollback;

  if (rollback.previousEmployee) {
    await admin
      .from("employees")
      .update({
        email: rollback.previousEmployee.email,
        employee_id: rollback.previousEmployee.employeeId,
        full_name: rollback.previousEmployee.fullName,
        is_active: rollback.previousEmployee.isActive,
        profile_id: rollback.previousEmployee.profileId,
      })
      .eq("agency_id", rollback.identity.agencyId)
      .eq("employee_id", rollback.identity.employeeId);
  } else {
    await admin
      .from("employees")
      .delete()
      .eq("agency_id", rollback.identity.agencyId)
      .eq("employee_id", rollback.identity.employeeId);
  }

  if (provisioned.createdProfileId) {
    await admin.from("profiles").delete().eq("id", provisioned.createdProfileId);
  }

  if (provisioned.createdAuthUserId) {
    await admin.auth.admin.deleteUser(provisioned.createdAuthUserId);
  }
}

async function findEmployeeProfileByEmail(
  admin: EmployeeProvisioningAdminClient,
  email: string,
): Promise<{ authUserId: string; profileId: string } | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id,auth_user_id,role")
    .eq("email", email)
    .maybeSingle();
  const profile = data as ProfileRecord | null;

  if (error) {
    throw new Error("Impossible de charger le profil salarie.");
  }

  if (!profile) {
    return null;
  }

  if (
    profile.role !== "employee" ||
    typeof profile.id !== "string" ||
    typeof profile.auth_user_id !== "string"
  ) {
    throw new Error("Un profil non salarie utilise deja cet email.");
  }

  return {
    authUserId: profile.auth_user_id,
    profileId: profile.id,
  };
}

async function findExistingEmployee(
  admin: EmployeeProvisioningAdminClient,
  identity: EmployeeIdentity,
): Promise<ExistingEmployeeRecord | null> {
  const { data, error } = await admin
    .from("employees")
    .select("employee_id,email,full_name,is_active,profile_id")
    .eq("agency_id", identity.agencyId)
    .eq("employee_id", identity.employeeId)
    .maybeSingle();
  const employee = data as EmployeeRecord | null;

  if (error) {
    throw new Error("Impossible de charger le salarie.");
  }

  if (!employee) {
    return null;
  }

  if (
    typeof employee.employee_id !== "string" ||
    typeof employee.email !== "string" ||
    typeof employee.full_name !== "string" ||
    typeof employee.is_active !== "boolean"
  ) {
    throw new Error("Salarie invalide.");
  }

  return {
    email: employee.email,
    employeeId: employee.employee_id,
    fullName: employee.full_name,
    isActive: employee.is_active,
    profileId: typeof employee.profile_id === "string" ? employee.profile_id : null,
  };
}

async function upsertLinkedEmployee(
  admin: EmployeeProvisioningAdminClient,
  input: { identity: EmployeeIdentity; profileId: string },
) {
  const { data, error } = await admin
    .from("employees")
    .upsert(
      {
        agency_id: input.identity.agencyId,
        email: input.identity.email,
        employee_id: input.identity.employeeId,
        full_name: input.identity.fullName,
        is_active: true,
        profile_id: input.profileId,
      },
      { onConflict: "agency_id,employee_id" },
    )
    .select("employee_id,email,full_name,profile_id")
    .single();
  const employee = data as EmployeeRecord | null;

  if (
    error ||
    employee?.profile_id !== input.profileId ||
    employee.employee_id !== input.identity.employeeId ||
    employee.email !== input.identity.email ||
    employee.full_name !== input.identity.fullName
  ) {
    throw new Error("Impossible de rattacher le salarie a son compte.");
  }
}
