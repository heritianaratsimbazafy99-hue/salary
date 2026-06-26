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

type AuthUserRecord = {
  id?: unknown;
};

type ProfileRecord = {
  id?: unknown;
};

type EmployeeRecord = {
  email?: unknown;
  employee_id?: unknown;
  full_name?: unknown;
  profile_id?: unknown;
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
