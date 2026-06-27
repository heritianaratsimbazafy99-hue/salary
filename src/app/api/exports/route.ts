import { NextResponse, type NextRequest } from "next/server";

import { isAppRole } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { apiError } from "@/lib/errors";
import {
  buildImportReportCsv,
  buildPublishedPayslipsCsv,
  canCreateExport,
  type ExportType,
  type ImportReportExportRow,
  type PublishedPayslipExportRow,
} from "@/lib/payroll/export";
import type { AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isExportType(value: unknown): value is ExportType {
  return value === "IMPORT_REPORT" || value === "PUBLISHED_PAYSLIPS";
}

function getExportType(body: unknown) {
  if (typeof body !== "object" || body == null || !("exportType" in body)) {
    return undefined;
  }

  return body.exportType;
}

function getAgencyId(body: unknown): string | null | undefined {
  if (typeof body !== "object" || body == null || !("agencyId" in body)) {
    return undefined;
  }

  if (typeof body.agencyId !== "string") {
    return null;
  }

  const agencyId = body.agencyId.trim();
  return UUID_PATTERN.test(agencyId) ? agencyId : null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseWriteClient = Pick<ReturnType<typeof createAdminClient>, "from">;

type ExportActor = {
  agencyId?: string | null;
  id: string;
  role: AppRole;
};

type ExportJobRecord = {
  export_type?: unknown;
  id?: unknown;
  status?: unknown;
};

type ImportReportDbRow = {
  agency_id?: unknown;
  created_at?: unknown;
  id?: unknown;
  invalid_row_count?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  source_filename?: unknown;
  status?: unknown;
  unknown_employee_count?: unknown;
  valid_row_count?: unknown;
};

type PublishedPayslipDbRow = {
  agency_id?: unknown;
  agency_name?: unknown;
  deductions_total?: unknown;
  employee_id?: unknown;
  employee_name?: unknown;
  gross_amount?: unknown;
  net_amount?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  published_at?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult, error: authError } = await supabase.auth.getUser();

  if (authError || !userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid JSON body"), { status: 422 });
  }

  const exportType = getExportType(body);
  if (!isExportType(exportType)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid export type"), { status: 422 });
  }

  const agencyId = getAgencyId(body);
  if (agencyId === null) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid agency id"), { status: 422 });
  }

  const actor = await loadExportActor(supabase, userResult.user.id);
  if (!actor) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  if (
    !canCreateExport({
      actorAgencyId: actor.agencyId,
      exportType,
      requestedAgencyId: agencyId,
      role: actor.role,
    })
  ) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  let exportJob;
  let csvContent;
  try {
    csvContent = await buildExportContent(supabase, {
      agencyId: agencyId ?? null,
      exportType,
    });
    const admin = createAdminClient();
    exportJob = await createExportJob(admin, {
      actorProfileId: actor.id,
      agencyId: agencyId ?? null,
      exportType,
    });

    await recordAuditEvent({
      action: "PAYROLL_EXPORT_REQUESTED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId: exportJob.agencyId,
      metadata: {
        agencyId: exportJob.agencyId,
        exportJobId: exportJob.id,
        exportType: exportJob.exportType,
        status: exportJob.status,
      },
      resourceId: exportJob.id,
      resourceType: "export_job",
    });
  } catch {
    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to create export job"), {
      status: 500,
    });
  }

  const filename = exportFilename(exportJob.exportType);

  return new NextResponse(csvContent, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8",
      "x-export-job-id": exportJob.id,
      "x-export-status": exportJob.status,
      "x-export-type": exportJob.exportType,
    },
  });
}

async function createExportJob(
  supabase: SupabaseWriteClient,
  input: {
    actorProfileId: string;
    agencyId: string | null;
    exportType: ExportType;
  },
) {
  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      agency_id: input.agencyId,
      export_type: input.exportType,
      requested_by: input.actorProfileId,
      completed_at: new Date().toISOString(),
      status: "COMPLETED",
    })
    .select("id,status,export_type")
    .single();

  const exportJob = data as ExportJobRecord | null;
  if (
    error ||
    typeof exportJob?.id !== "string" ||
    exportJob.status !== "COMPLETED" ||
    !isExportType(exportJob.export_type)
  ) {
    throw new Error("Unable to create export job");
  }

  return {
    agencyId: input.agencyId,
    exportType: exportJob.export_type,
    id: exportJob.id,
    status: exportJob.status,
  };
}

async function buildExportContent(
  supabase: SupabaseServerClient,
  input: { agencyId: string | null; exportType: ExportType },
): Promise<string> {
  if (input.exportType === "IMPORT_REPORT") {
    return buildImportReportCsv(await loadImportReportRows(supabase, input.agencyId));
  }

  return buildPublishedPayslipsCsv(await loadPublishedPayslipRows(supabase, input.agencyId));
}

async function loadImportReportRows(
  supabase: SupabaseServerClient,
  agencyId: string | null,
): Promise<ImportReportExportRow[]> {
  const baseQuery = supabase
    .from("payroll_imports")
    .select(
      "id,agency_id,period_start,period_end,status,source_filename,valid_row_count,invalid_row_count,unknown_employee_count,created_at",
    );
  const scopedQuery = agencyId ? baseQuery.eq("agency_id", agencyId) : baseQuery;
  const { data, error } = await scopedQuery.order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load import report export rows.");
  }

  return ((data ?? []) as ImportReportDbRow[]).flatMap((row): ImportReportExportRow[] => {
    if (
      typeof row.id !== "string" ||
      typeof row.agency_id !== "string" ||
      typeof row.period_start !== "string" ||
      typeof row.period_end !== "string" ||
      typeof row.status !== "string" ||
      typeof row.source_filename !== "string"
    ) {
      return [];
    }

    return [
      {
        agencyId: row.agency_id,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        id: row.id,
        invalidRowCount: countValue(row.invalid_row_count),
        periodEnd: row.period_end,
        periodStart: row.period_start,
        sourceFilename: row.source_filename,
        status: row.status,
        unknownEmployeeCount: countValue(row.unknown_employee_count),
        validRowCount: countValue(row.valid_row_count),
      },
    ];
  });
}

async function loadPublishedPayslipRows(
  supabase: SupabaseServerClient,
  agencyId: string | null,
): Promise<PublishedPayslipExportRow[]> {
  const baseQuery = supabase
    .from("payroll_analytics_rows")
    .select(
      "agency_id,agency_name,employee_id,employee_name,period_start,period_end,gross_amount,deductions_total,net_amount,published_at",
    );
  const scopedQuery = agencyId ? baseQuery.eq("agency_id", agencyId) : baseQuery;
  const { data, error } = await scopedQuery.order("published_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load published payslip export rows.");
  }

  return ((data ?? []) as PublishedPayslipDbRow[]).flatMap((row): PublishedPayslipExportRow[] => {
    if (
      typeof row.agency_id !== "string" ||
      typeof row.agency_name !== "string" ||
      typeof row.employee_id !== "string" ||
      typeof row.employee_name !== "string" ||
      typeof row.period_start !== "string" ||
      typeof row.period_end !== "string" ||
      typeof row.published_at !== "string"
    ) {
      return [];
    }

    return [
      {
        agencyId: row.agency_id,
        agencyName: row.agency_name,
        deductionsTotal: countValue(row.deductions_total),
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        grossAmount: countValue(row.gross_amount),
        netAmount: countValue(row.net_amount),
        periodEnd: row.period_end,
        periodStart: row.period_start,
        publishedAt: row.published_at,
      },
    ];
  });
}

function exportFilename(exportType: ExportType) {
  const suffix = new Date().toISOString().slice(0, 10);
  return `${exportType.toLowerCase()}-${suffix}.csv`;
}

function countValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

async function loadExportActor(
  supabase: SupabaseServerClient,
  authUserId: string,
): Promise<ExportActor | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("auth_user_id", authUserId)
    .single();

  if (profileError || typeof profile?.id !== "string" || !isAppRole(profile.role)) {
    return null;
  }

  if (profile.role !== "agency_manager") {
    return {
      id: profile.id,
      role: profile.role,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("agency_id")
    .eq("profile_id", profile.id)
    .single();

  if (membershipError || typeof membership?.agency_id !== "string") {
    return null;
  }

  return {
    agencyId: membership.agency_id,
    id: profile.id,
    role: profile.role,
  };
}
