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
import { z } from "zod";
import { buildExportWorkbook } from "@/lib/exports/workbook";
import { PdfExportError, renderPayslipsPdf } from "@/lib/payslips/pdf";
import { loadPublishedDocuments } from "@/lib/exports/documents";
import type { AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const inputSchema = z.object({
  exportType: z.enum(["IMPORT_REPORT", "PUBLISHED_PAYSLIPS"]),
  format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
  agencyId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  importId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  periodStart: date.optional(),
  periodEnd: date.optional(),
}).refine((value) => !value.periodStart || !value.periodEnd || value.periodStart <= value.periodEnd)
  .refine((value) => !value.importId || value.exportType === "IMPORT_REPORT")
  .refine((value) => value.format !== "pdf" || value.exportType === "PUBLISHED_PAYSLIPS");
type ExportInput = z.infer<typeof inputSchema>;
function isExportType(value: unknown): value is ExportType {
  return value === "IMPORT_REPORT" || value === "PUBLISHED_PAYSLIPS";
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

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Format, agence ou période d’export invalide."), { status: 422 });
  }
  const input = parsed.data;
  const { exportType, agencyId, format } = input;

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
  let content: string | Uint8Array;
  let rowCount = 0;
  try {
    const result = await buildExportContent(supabase, input);
    content = result.content;
    rowCount = result.rowCount;
    const admin = createAdminClient();
    exportJob = await createExportJob(admin, {
      actorProfileId: actor.id,
      agencyId: agencyId ?? null,
      exportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
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
        format,
        rowCount,
        importId: input.importId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      resourceId: exportJob.id,
      resourceType: "export_job",
    });
  } catch (error) {
    if (error instanceof PdfExportError || (error instanceof Error && error.message.startsWith("EXPORT_LIMIT"))) {
      return NextResponse.json(apiError("VALIDATION_ERROR", error instanceof PdfExportError ? error.message : "Export limité à 5 000 lignes. Réduisez la période ou sélectionnez une agence."), { status: 422 });
    }
    return NextResponse.json(apiError("INTERNAL_ERROR", "Impossible de générer ou d’auditer l’export. Réessayez."), {
      status: 500,
    });
  }

  const filename = exportFilename(exportJob.exportType, format);

  return new NextResponse(typeof content === "string" ? content : new Uint8Array(content).buffer, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
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
    periodStart?: string;
    periodEnd?: string;
  },
) {
  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      agency_id: input.agencyId,
      export_type: input.exportType,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
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

async function buildExportContent(supabase: SupabaseServerClient, input: ExportInput): Promise<{ content: string | Uint8Array; rowCount: number }> {
  if (input.format === "pdf") {
    const documents = await loadPublishedDocuments(supabase, input);
    return { content: await renderPayslipsPdf(documents), rowCount: documents.length };
  }
  if (input.exportType === "IMPORT_REPORT") {
    const rows = await loadImportReportRows(supabase, input);
    return { content: input.format === "csv" ? buildImportReportCsv(rows) : await buildExportWorkbook(rows, input.exportType), rowCount: rows.length };
  }
  const rows = await loadPublishedPayslipRows(supabase, input);
  return { content: input.format === "csv" ? buildPublishedPayslipsCsv(rows) : await buildExportWorkbook(rows, input.exportType), rowCount: rows.length };
}

async function loadRows(supabase: SupabaseServerClient, table: string, columns: string, input: ExportInput, order: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset <= 5000; offset += 500) {
    let query = supabase.from(table).select(columns).order(order, { ascending: false });
    if (table === "payroll_imports") query = query.order("id");
    else query = query.order("agency_id").order("employee_id").order("period_start").order("period_end");
    if (input.agencyId) query = query.eq("agency_id", input.agencyId);
    if (input.importId) query = query.eq("id", input.importId);
    if (input.periodStart) query = query.gte("period_start", input.periodStart);
    if (input.periodEnd) query = query.lte("period_end", input.periodEnd);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error("Impossible de charger les données d’export.");
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (rows.length > 5000) throw new Error("EXPORT_LIMIT");
    if (!data || data.length < 500) return rows;
  }
  throw new Error("EXPORT_LIMIT");
}

async function loadImportReportRows(
  supabase: SupabaseServerClient,
  input: ExportInput,
): Promise<ImportReportExportRow[]> {
  const data = await loadRows(supabase, "payroll_imports", "id,agency_id,period_start,period_end,status,source_filename,valid_row_count,invalid_row_count,unknown_employee_count,created_at", input, "created_at");

  return ((data ?? []) as ImportReportDbRow[]).flatMap((row): ImportReportExportRow[] => {
    if (
      typeof row.id !== "string" ||
      typeof row.agency_id !== "string" ||
      typeof row.period_start !== "string" ||
      typeof row.period_end !== "string" ||
      typeof row.status !== "string" ||
      typeof row.source_filename !== "string"
    ) {
      throw new Error("Données d’export invalides.");
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
  input: ExportInput,
): Promise<PublishedPayslipExportRow[]> {
  const data = await loadRows(supabase, "payroll_analytics_rows", "agency_id,agency_name,employee_id,employee_name,period_start,period_end,gross_amount,deductions_total,net_amount,published_at", input, "published_at");

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
      throw new Error("Données d’export invalides.");
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

function exportFilename(exportType: ExportType, format: string) {
  const suffix = new Date().toISOString().slice(0, 10);
  return `${exportType.toLowerCase()}-${suffix}.${format}`;
}

function countValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  throw new Error("Montant d’export invalide.");
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
