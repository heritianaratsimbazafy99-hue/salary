import "server-only";

import type { AppRole } from "../roles";
import { createClient } from "../supabase/server";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanAssignAgencyManager,
  assertCanManageAgencies,
  assertCanReadPayrollAnalytics,
  isAppRole,
} from "./permissions";

export type CurrentActor = {
  id: string;
  role: AppRole;
};

export async function getCurrentActor(): Promise<CurrentActor> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims.sub;

  if (claimsError || !authUserId) {
    throw new Error(AUTH_REQUIRED_ERROR_MESSAGE);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("auth_user_id", authUserId)
    .single();

  if (profileError || typeof profile?.id !== "string" || !isAppRole(profile.role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  return {
    id: profile.id,
    role: profile.role,
  };
}

export async function getCurrentActorRole(): Promise<AppRole> {
  const actor = await getCurrentActor();

  return actor.role;
}

export async function requireCanManageAgencies(): Promise<AppRole> {
  const role = await getCurrentActorRole();

  assertCanManageAgencies(role);

  return role;
}

export async function requireCanReadPayrollAnalytics(): Promise<CurrentActor> {
  const actor = await getCurrentActor();

  assertCanReadPayrollAnalytics(actor.role);

  return actor;
}

export async function requireCanAssignAgencyManager(): Promise<AppRole> {
  const role = await getCurrentActorRole();

  assertCanAssignAgencyManager(role);

  return role;
}
