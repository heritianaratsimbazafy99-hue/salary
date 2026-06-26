import "server-only";

import { z } from "zod";

import { requireCanAssignAgencyManager } from "./auth";
import { createAdminClient } from "../supabase/admin";

export type AgencyManagerProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "agency_manager";
};

type AuthUserRecord = {
  id?: unknown;
};

const CreateAgencyManagerInputSchema = z.object({
  agencyId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  fullName: z.string().trim().min(1).max(160),
});

export async function createAgencyManager(input: {
  email: string;
  fullName: string;
  agencyId: string;
}): Promise<AgencyManagerProfile> {
  const parsedInput = CreateAgencyManagerInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new Error("Champs invalides.");
  }

  await requireCanAssignAgencyManager();

  const admin = createAdminClient();
  const { data: authUserData, error: authUserError } = await admin.auth.admin.createUser({
    email: parsedInput.data.email,
    email_confirm: true,
    user_metadata: {
      full_name: parsedInput.data.fullName,
      role: "agency_manager",
    },
  });
  const authUser = authUserData.user as AuthUserRecord | null;
  const authUserId = typeof authUser?.id === "string" ? authUser.id : null;

  if (authUserError || !authUserId) {
    throw new Error("Impossible de creer le responsable d'agence.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: parsedInput.data.email,
      full_name: parsedInput.data.fullName,
      role: "agency_manager",
    })
    .select("id,email,full_name,role,auth_user_id")
    .single();

  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error("Impossible de creer le responsable d'agence.");
  }

  const { error: membershipError } = await admin.from("agency_memberships").insert({
    agency_id: parsedInput.data.agencyId,
    profile_id: profile.id,
  });

  if (membershipError) {
    await admin.from("profiles").delete().eq("id", profile.id);
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error("Impossible de rattacher le responsable a l'agence.");
  }

  return profile as AgencyManagerProfile;
}
