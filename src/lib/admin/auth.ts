import "server-only";

import type { AppRole } from "../roles";
import { createClient } from "../supabase/server";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanAssignAgencyManager,
  assertCanManageAgencies,
  isAppRole,
} from "./permissions";

export async function getCurrentActorRole(): Promise<AppRole> {
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

export async function requireCanManageAgencies(): Promise<AppRole> {
  const role = await getCurrentActorRole();

  assertCanManageAgencies(role);

  return role;
}

export async function requireCanAssignAgencyManager(): Promise<AppRole> {
  const role = await getCurrentActorRole();

  assertCanAssignAgencyManager(role);

  return role;
}
