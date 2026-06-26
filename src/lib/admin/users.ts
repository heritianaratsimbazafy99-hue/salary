import "server-only";

import { z } from "zod";

import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanAssignAgencyManager,
  isAppRole,
} from "./permissions";
import type { AppRole } from "../roles";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";

export type AgencyManagerProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "agency_manager";
};

const CreateAgencyManagerInputSchema = z.object({
  agencyId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  email: z
    .email()
    .trim()
    .transform((email) => email.toLowerCase()),
  fullName: z.string().trim().min(1).max(160),
});

async function getCurrentActorRole(): Promise<AppRole> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims.sub;

  if (claimsError || !authUserId) {
    throw new Error(AUTH_REQUIRED_ERROR_MESSAGE);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", authUserId)
    .single();

  if (profileError || !isAppRole(profile?.role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  return profile.role;
}

export async function createAgencyManager(input: {
  email: string;
  fullName: string;
  agencyId: string;
}): Promise<AgencyManagerProfile> {
  const parsedInput = CreateAgencyManagerInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new Error("Champs invalides.");
  }

  assertCanAssignAgencyManager(await getCurrentActorRole());

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      email: parsedInput.data.email,
      full_name: parsedInput.data.fullName,
      role: "agency_manager",
    })
    .select("id,email,full_name,role")
    .single();

  if (profileError || !profile) {
    throw new Error("Impossible de creer le responsable d'agence.");
  }

  const { error: membershipError } = await admin.from("agency_memberships").insert({
    agency_id: parsedInput.data.agencyId,
    profile_id: profile.id,
  });

  if (membershipError) {
    await admin.from("profiles").delete().eq("id", profile.id);
    throw new Error("Impossible de rattacher le responsable a l'agence.");
  }

  return profile as AgencyManagerProfile;
}
