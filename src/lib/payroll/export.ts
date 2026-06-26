import type { AppRole } from "@/lib/roles";

export type ExportType = "IMPORT_REPORT" | "PUBLISHED_PAYSLIPS";

export function canCreateExport(input: {
  role: AppRole;
  exportType: ExportType;
  actorAgencyId?: string | null;
  requestedAgencyId?: string | null;
}) {
  if (input.role === "hr_central" || input.role === "super_admin") return true;

  return (
    input.role === "agency_manager" &&
    input.exportType === "IMPORT_REPORT" &&
    hasAgencyId(input.actorAgencyId) &&
    hasAgencyId(input.requestedAgencyId) &&
    input.actorAgencyId === input.requestedAgencyId
  );
}

function hasAgencyId(agencyId: string | null | undefined): agencyId is string {
  return typeof agencyId === "string" && agencyId.trim().length > 0;
}
