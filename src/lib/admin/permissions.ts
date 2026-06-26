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
