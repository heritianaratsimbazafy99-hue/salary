import "server-only";

import type { AppRole } from "../roles";
import { createClient } from "../supabase/server";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanAssignAgencyManager,
  assertCanManageAgencies,
  assertCanManagePayrollForAgency,
  assertCanReadPayrollAnalytics,
  isAppRole,
} from "./permissions";

export type CurrentActor = {
  id: string;
  role: AppRole;
};

export type AgencyScopedActor = CurrentActor & {
  agencyId: string;
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

export async function getCurrentAgencyScopedActor(): Promise<AgencyScopedActor> {
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

  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("agency_id")
    .eq("profile_id", profile.id)
    .single();

  if (membershipError || typeof membership?.agency_id !== "string") {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  return {
    agencyId: membership.agency_id,
    id: profile.id,
    role: profile.role,
  };
}

export async function requireAgencyManagerForAgency(agencyId: string): Promise<AgencyScopedActor> {
  const actor = await getCurrentAgencyScopedActor();

  assertCanManagePayrollForAgency({
    actorAgencyId: actor.agencyId,
    requestedAgencyId: agencyId,
    role: actor.role,
  });

  return actor;
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
