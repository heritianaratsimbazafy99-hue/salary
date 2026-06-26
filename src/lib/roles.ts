export const APP_ROLES = [
  "agency_manager",
  "employee",
  "hr_central",
  "super_admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function canReadAllAgencies(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canPublishForAgency(role: AppRole): boolean {
  return role === "agency_manager";
}
