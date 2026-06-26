import { APP_ROLES, type AppRole } from "../roles";

export const AUTH_REQUIRED_ERROR_MESSAGE = "Authentification requise.";
export const FORBIDDEN_ERROR_MESSAGE = "Action non autorisee.";

export function isAppRole(role: unknown): role is AppRole {
  return typeof role === "string" && (APP_ROLES as readonly string[]).includes(role);
}

export function canManageAgencies(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canAssignAgencyManager(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canReadPayrollAnalytics(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canManagePayrollForAgency(input: {
  role: AppRole;
  actorAgencyId?: string | null;
  requestedAgencyId?: string | null;
}): boolean {
  return (
    input.role === "agency_manager" &&
    hasAgencyId(input.actorAgencyId) &&
    hasAgencyId(input.requestedAgencyId) &&
    input.actorAgencyId === input.requestedAgencyId
  );
}

export function assertCanManageAgencies(role: AppRole): void {
  if (!canManageAgencies(role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }
}

export function assertCanAssignAgencyManager(role: AppRole): void {
  if (!canAssignAgencyManager(role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }
}

export function assertCanReadPayrollAnalytics(role: AppRole): void {
  if (!canReadPayrollAnalytics(role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }
}

export function assertCanManagePayrollForAgency(input: {
  role: AppRole;
  actorAgencyId?: string | null;
  requestedAgencyId?: string | null;
}): void {
  if (!canManagePayrollForAgency(input)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }
}

function hasAgencyId(agencyId: string | null | undefined): agencyId is string {
  return typeof agencyId === "string" && agencyId.trim().length > 0;
}
