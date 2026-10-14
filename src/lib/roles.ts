export const APP_ROLES = [
  "agency_manager",
  "employee",
  "hr_central",
  "super_admin",
  "team_manager",
  "client_viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles whose access is limited to HR scopes (departments/sites of one agency). */
export const HR_SCOPED_ROLES = ["team_manager", "client_viewer"] as const;

export type HrScopedRole = (typeof HR_SCOPED_ROLES)[number];

export function isHrScopedRole(role: unknown): role is HrScopedRole {
  return typeof role === "string" && (HR_SCOPED_ROLES as readonly string[]).includes(role);
}

export function canReadAllAgencies(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canPublishForAgency(role: AppRole): boolean {
  return role === "agency_manager";
}
