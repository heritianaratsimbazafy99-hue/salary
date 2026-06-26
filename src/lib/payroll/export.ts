import type { AppRole } from "@/lib/roles";

export type ExportType = "IMPORT_REPORT" | "PUBLISHED_PAYSLIPS";

export function canCreateExport(input: {
  role: AppRole;
  exportType: ExportType;
  actorAgencyId?: string;
  requestedAgencyId?: string;
}) {
  if (input.role === "hr_central" || input.role === "super_admin") return true;

  return (
    input.role === "agency_manager" &&
    input.exportType === "IMPORT_REPORT" &&
    input.actorAgencyId != null &&
    input.actorAgencyId === input.requestedAgencyId
  );
}
