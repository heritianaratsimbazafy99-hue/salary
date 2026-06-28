import type { AppRole } from "@/lib/roles";
import { toCsv } from "@/lib/payroll/csv";

export type ExportType = "IMPORT_REPORT" | "PUBLISHED_PAYSLIPS";

export type ImportReportExportRow = {
  agencyId: string;
  createdAt: string;
  id: string;
  invalidRowCount: number;
  periodEnd: string;
  periodStart: string;
  sourceFilename: string;
  status: string;
  unknownEmployeeCount: number;
  validRowCount: number;
};

export type PublishedPayslipExportRow = {
  agencyId: string;
  agencyName: string;
  deductionsTotal: number;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  netAmount: number;
  periodEnd: string;
  periodStart: string;
  publishedAt: string;
};

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

export function buildImportReportCsv(rows: ImportReportExportRow[]): string {
  return toCsv(
    [
      "import_id",
      "agency_id",
      "period_start",
      "period_end",
      "status",
      "source_filename",
      "valid_rows",
      "invalid_rows",
      "unknown_employees",
      "created_at",
    ],
    rows.map((row) => [
      row.id,
      row.agencyId,
      row.periodStart,
      row.periodEnd,
      row.status,
      row.sourceFilename,
      row.validRowCount,
      row.invalidRowCount,
      row.unknownEmployeeCount,
      row.createdAt,
    ]),
  );
}

export function buildPublishedPayslipsCsv(rows: PublishedPayslipExportRow[]): string {
  return toCsv(
    [
      "agency_id",
      "agency_name",
      "employee_id",
      "employee_name",
      "period_start",
      "period_end",
      "gross_amount",
      "deductions_total",
      "net_amount",
      "published_at",
    ],
    rows.map((row) => [
      row.agencyId,
      row.agencyName,
      row.employeeId,
      row.employeeName,
      row.periodStart,
      row.periodEnd,
      row.grossAmount,
      row.deductionsTotal,
      row.netAmount,
      row.publishedAt,
    ]),
  );
}
