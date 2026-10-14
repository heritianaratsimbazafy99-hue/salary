import "server-only";
import { EmployeeIdSchema } from "@/lib/employees/identity";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export type EmployeeIdentityInput = {
  agencyId: string;
  employeeId: string;
  email: string;
  fullName: string;
  invitedByProfileId?: string;
};

export type EmployeeIdentity = Omit<EmployeeIdentityInput, "invitedByProfileId">;

export type LinkedEmployeeAuthProfile = Omit<EmployeeIdentity, "agencyId"> & {
  authUserId: string;
  profileId: string;
};

export type ProvisionedEmployeeAuthProfile = {
  authUserId: string | null;
  email: string;
  employeeId: string;
  employeeRollback: {
    identity: EmployeeIdentity;
    previousEmployee: ExistingEmployeeRecord | null;
  };
  fullName: string;
  invitationId?: string;
  // Server memory only: never serialize this provisioning object in an API response.
  invitationToken?: string;
  invitationRollback?: {
    tokenHash: string;
    previousInvitation: ExistingInvitationRecord | null;
  };
  profileId: string | null;
};

type EmployeeProvisioningAdminClient = Pick<ReturnType<typeof createAdminClient>, "from">;

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

type ExistingInvitationRecord = {
  id: string;
  email: string;
  employee_id: string;
  full_name: string;
  invited_by: string;
  token_hash: string;
  expires_at: string;
  updated_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const EmployeeIdentityInputSchema = z.object({
  agencyId: z.string().trim().regex(UUID_PATTERN),
  employeeId: EmployeeIdSchema,
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  fullName: z.string().trim().min(1).max(160),
  invitedByProfileId: z.string().trim().regex(UUID_PATTERN).optional(),
});

export function normalizeEmployeeIdentity(input: EmployeeIdentityInput): EmployeeIdentity {
  return {
    agencyId: input.agencyId,
    employeeId: EmployeeIdSchema.parse(input.employeeId),
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
  const previousEmployee = await findExistingEmployee(admin, identity);
  if (previousEmployee?.isActive === false) throw new Error("Ce salarié est désactivé. Une réactivation RH est nécessaire.");
  if (previousEmployee && previousEmployee.email.toLowerCase() !== identity.email) {
    throw new Error("L’email diffère du dossier salarié. Faites vérifier son identité avant de publier.");
  }
  const profileId = previousEmployee?.profileId ?? null;
  const employeeRollback = {
    identity,
    previousEmployee,
  };

  await upsertPublicationEmployee(admin, {
    identity,
    profileId,
    exists: previousEmployee !== null,
  });

  let invitation: Awaited<ReturnType<typeof upsertPendingEmployeeInvitation>> | null = null;

  if (!profileId) {
    try {
      invitation = await upsertPendingEmployeeInvitation(admin, {
        identity,
        invitedBy: parsedInput.data.invitedByProfileId ?? "",
      });
    } catch (error) {
      await rollbackEmployeeAuthProfileProvisioning(admin, {
        authUserId: null,
        email: identity.email,
        employeeId: identity.employeeId,
        employeeRollback,
        fullName: identity.fullName,
        profileId,
      });
      throw error;
    }
  }

  return {
    authUserId: null,
    email: identity.email,
    employeeRollback,
    employeeId: identity.employeeId,
    fullName: identity.fullName,
    invitationId: invitation?.invitationId,
    invitationToken: invitation?.token,
    invitationRollback: invitation?.rollback,
    profileId,
  };
}

export async function rollbackEmployeeAuthProfileProvisioning(
  admin: EmployeeProvisioningAdminClient,
  provisioned: ProvisionedEmployeeAuthProfile,
) {
  const rollback = provisioned.employeeRollback;

  if (provisioned.invitationId && provisioned.invitationRollback) {
    const previousInvitation = provisioned.invitationRollback.previousInvitation;
    // Restore only this attempt: never overwrite an accepted or newer invitation.
    // New invitations have not been sent yet; deleting them also avoids collisions
    // with an older REVOKED row under the invitation status uniqueness constraint.
    const invitationMutation = previousInvitation
      ? admin.from("employee_invitations").update({
          email: previousInvitation.email,
          employee_id: previousInvitation.employee_id,
          full_name: previousInvitation.full_name,
          invited_by: previousInvitation.invited_by,
          token_hash: previousInvitation.token_hash,
          expires_at: previousInvitation.expires_at,
          updated_at: previousInvitation.updated_at,
        })
      : admin.from("employee_invitations").delete();
    const { data, error } = await invitationMutation
      .eq("id", provisioned.invitationId)
      .eq("status", "PENDING")
      .eq("token_hash", provisioned.invitationRollback.tokenHash)
      .select("id")
      .maybeSingle();

    if (error || !data) return;
  }

  const employeeMutation = rollback.previousEmployee
    ? admin.from("employees").update({
        email: rollback.previousEmployee.email,
        employee_id: rollback.previousEmployee.employeeId,
        full_name: rollback.previousEmployee.fullName,
        profile_id: rollback.previousEmployee.profileId,
      })
    : admin.from("employees").delete();
  const guardedMutation = employeeMutation
    .eq("agency_id", rollback.identity.agencyId)
    .eq("employee_id", rollback.identity.employeeId)
    .eq("email", rollback.identity.email)
    .eq("full_name", rollback.identity.fullName)
    .eq("is_active", true);

  // An activation can finish between provisioning and a failed publication.
  // Never detach or delete the account linked by that activation.
  if (provisioned.profileId) {
    await guardedMutation.eq("profile_id", provisioned.profileId);
  } else {
    await guardedMutation.is("profile_id", null);
  }
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

async function upsertPublicationEmployee(
  admin: EmployeeProvisioningAdminClient,
  input: { identity: EmployeeIdentity; profileId: string | null; exists: boolean },
) {
  const payload = {
    agency_id: input.identity.agencyId,
    email: input.identity.email,
    employee_id: input.identity.employeeId,
    full_name: input.identity.fullName,
    profile_id: input.profileId,
  };
  // Do not overwrite activation or deactivation that happened after the read.
  let mutation;
  if (input.exists) {
    const query = admin.from("employees").update(payload)
      .eq("agency_id", input.identity.agencyId).eq("employee_id", input.identity.employeeId)
      .eq("is_active", true).eq("email", input.identity.email);
    mutation = input.profileId ? query.eq("profile_id", input.profileId) : query.is("profile_id", null);
  } else {
    mutation = admin.from("employees").upsert(payload, {
      onConflict: "agency_id,employee_id", ignoreDuplicates: true,
    });
  }
  const { data, error } = await mutation.select("employee_id,email,full_name,is_active,profile_id").single();
  const employee = data as EmployeeRecord | null;
  const employeeProfileId = typeof employee?.profile_id === "string" ? employee.profile_id : null;

  if (
    error ||
    !employee ||
    employeeProfileId !== input.profileId ||
    employee.employee_id !== input.identity.employeeId ||
    employee.email !== input.identity.email ||
    employee.full_name !== input.identity.fullName ||
    employee.is_active !== true
  ) {
    throw new Error("Impossible de rattacher le salarie a son compte.");
  }
}

export class InvitationCooldownError extends Error {}

export async function upsertPendingEmployeeInvitation(
  admin: EmployeeProvisioningAdminClient,
  input: { identity: EmployeeIdentity; invitedBy: string; cooldownMs?: number },
) {
  if (!UUID_PATTERN.test(input.invitedBy)) {
    throw new Error("Impossible de creer l'invitation salarie.");
  }

  const existingInvitation = await findPendingEmployeeInvitation(admin, input.identity);
  if (existingInvitation && input.cooldownMs) {
    const lastUpdated = Date.parse(existingInvitation.updated_at);
    if (!Number.isFinite(lastUpdated) || Date.now() - lastUpdated < input.cooldownMs) {
      throw new InvitationCooldownError("Invitation récemment envoyée.");
    }
  }
  const token = randomUUID() + randomUUID();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  const updatedAt = new Date().toISOString();

  if (existingInvitation) {
    const { data, error } = await admin
      .from("employee_invitations")
      .update({
        email: input.identity.email,
        employee_id: input.identity.employeeId,
        full_name: input.identity.fullName,
        invited_by: input.invitedBy,
        token_hash: tokenHash,
        expires_at: expiresAt,
        updated_at: updatedAt,
      })
      .eq("id", existingInvitation.id)
      .eq("status", "PENDING")
      .eq("token_hash", existingInvitation.token_hash)
      .eq("updated_at", existingInvitation.updated_at)
      .select("id")
      .single();

    if (input.cooldownMs && error?.code === "PGRST116") {
      throw new InvitationCooldownError("Invitation modifiée par une autre demande.");
    }
    if (error || data?.id !== existingInvitation.id) {
      throw new Error("Impossible de creer l'invitation salarie.");
    }

    return {
      invitationId: existingInvitation.id,
      token,
      rollback: { tokenHash, previousInvitation: existingInvitation },
    };
  }

  const { data, error } = await admin
    .from("employee_invitations")
    .upsert(
      {
        agency_id: input.identity.agencyId,
        email: input.identity.email,
        employee_id: input.identity.employeeId,
        full_name: input.identity.fullName,
        invited_by: input.invitedBy,
        status: "PENDING",
        token_hash: tokenHash,
        expires_at: expiresAt,
        updated_at: updatedAt,
      },
      { ignoreDuplicates: true, onConflict: "agency_id,employee_id,status" },
    )
    .select("id")
    .single();

  if (error || typeof data?.id !== "string") {
    throw new Error("Impossible de creer l'invitation salarie.");
  }

  return {
    invitationId: data.id as string,
    token,
    rollback: { tokenHash, previousInvitation: null },
  };
}

async function findPendingEmployeeInvitation(
  admin: EmployeeProvisioningAdminClient,
  identity: EmployeeIdentity,
): Promise<ExistingInvitationRecord | null> {
  const { data, error } = await admin
    .from("employee_invitations")
    .select("id,email,employee_id,full_name,invited_by,token_hash,expires_at,updated_at")
    .eq("agency_id", identity.agencyId)
    .eq("employee_id", identity.employeeId)
    .eq("status", "PENDING")
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de charger l'invitation salarie.");
  }

  if (!data) {
    return null;
  }

  const requiredFields = [
    "id", "email", "employee_id", "full_name", "invited_by", "token_hash", "expires_at", "updated_at",
  ] as const;
  if (requiredFields.some((field) => typeof data[field] !== "string")) {
    throw new Error("Invitation salarie invalide.");
  }

  return data as ExistingInvitationRecord;
}

async function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
