import { notFound, redirect } from "next/navigation";

import { ColumnMappingForm } from "@/components/imports/ColumnMappingForm";
import { ImportReport } from "@/components/imports/ImportReport";
import { PayslipPreviewTable } from "@/components/imports/PayslipPreviewTable";
import { PublishImportButton } from "@/components/imports/PublishImportButton";
import { UploadStepper } from "@/components/imports/UploadStepper";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanManagePayrollForAgency,
} from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ importId: string }>;
};

type ImportRecord = {
  agency_id?: unknown;
  id?: unknown;
  invalid_row_count?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  source_filename?: unknown;
  status?: unknown;
  unknown_employee_count?: unknown;
  valid_row_count?: unknown;
};

type ImportErrorRecord = {
  field_name?: unknown;
  message?: unknown;
  row_number?: unknown;
};

type ImportRowRecord = {
  employee_id?: unknown;
  employee_name?: unknown;
  has_manual_adjustments?: unknown;
  id?: unknown;
  normalized_data?: unknown;
  raw_unknown_columns?: unknown;
};

type ImportDetail = {
  agencyId: string;
  id: string;
  invalidRowCount: number;
  periodEnd: string;
  periodStart: string;
  sourceFilename: string;
  status: string;
  unknownEmployeeCount: number;
  validRowCount: number;
};

type ImportReportError = {
  fieldName: string;
  message: string;
  rowNumber: number;
};

type PreviewRow = {
  deductionsTotal: number;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  hasManualAdjustments: boolean;
  id: string;
  netAmount: number;
  rawUnknownColumns: Record<string, unknown>;
};

export default async function ImportDetailPage({ params }: PageProps) {
  const { importId } = await params;
  const normalizedImportId = importId.trim();
  if (!UUID_PATTERN.test(normalizedImportId)) {
    notFound();
  }

  const actor = await requireManagerActor();
  if (!actor) return <ForbiddenManagerAccess />;

  const supabase = await createClient();
  const payrollImport = await loadPayrollImportDetail(supabase, {
    agencyId: actor.agencyId,
    importId: normalizedImportId,
  });

  if (!payrollImport) {
    notFound();
  }

  const [errors, previewRows] = await Promise.all([
    loadPayrollImportErrors(supabase, normalizedImportId),
    loadPayrollImportRows(supabase, {
      agencyId: actor.agencyId,
      importId: normalizedImportId,
    }),
  ]);
  const allUnknownColumns = uniqueSortedColumns(
    previewRows.flatMap((row) => Object.keys(row.rawUnknownColumns)),
  );
  const mappedColumns = await loadMappedColumns(supabase, actor.agencyId, allUnknownColumns);
  const unknownColumns = allUnknownColumns.filter((column) => !mappedColumns.has(column));

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Espace manager"
          title="Rapport d'import"
          description={`${payrollImport.sourceFilename} · ${payrollImport.periodStart} – ${payrollImport.periodEnd}`}
          actions={
            payrollImport.status === "READY_FOR_PREVIEW" ? (
              <PublishImportButton importId={payrollImport.id} />
            ) : undefined
          }
        />

        <UploadStepper currentStep={currentStepForStatus(payrollImport.status)} />
        <ImportReport
          errors={errors}
          invalidRowCount={payrollImport.invalidRowCount}
          unknownEmployeeCount={payrollImport.unknownEmployeeCount}
          validRowCount={payrollImport.validRowCount}
        />

        {payrollImport.status === "NEEDS_MAPPING" ? (
          <section aria-labelledby="mapping-title" className="grid gap-4">
            <div>
              <h2 className="font-display text-base font-semibold" id="mapping-title">
                Mapping des colonnes
              </h2>
            </div>
            <ColumnMappingForm importId={payrollImport.id} unknownColumns={unknownColumns} />
          </section>
        ) : null}

        <section aria-labelledby="preview-title" className="grid gap-4">
          <div>
            <h2 className="font-display text-base font-semibold" id="preview-title">
              Previsualisation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Apercu des lignes valides rattachees a cet import.
            </p>
          </div>
          <PayslipPreviewTable rows={previewRows} />
        </section>
      </div>
    </AppShell>
  );
}

async function requireManagerActor() {
  try {
    const actor = await getCurrentAgencyScopedActor();
    assertCanManagePayrollForAgency({
      actorAgencyId: actor.agencyId,
      requestedAgencyId: actor.agencyId,
      role: actor.role,
    });

    return actor;
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return null;
    }

    throw error;
  }
}

async function loadPayrollImportDetail(
  supabase: { from: (table: string) => unknown },
  input: { agencyId: string; importId: string },
): Promise<ImportDetail | null> {
  const query = supabase.from("payroll_imports") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (
          column: string,
          value: string,
        ) => { single: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  const { data, error } = await query
    .select(
      "id,agency_id,period_start,period_end,status,source_filename,valid_row_count,invalid_row_count,unknown_employee_count",
    )
    .eq("id", input.importId)
    .eq("agency_id", input.agencyId)
    .single();

  if (error || !data) {
    return null;
  }

  const record = data as ImportRecord;
  if (
    typeof record.id !== "string" ||
    typeof record.agency_id !== "string" ||
    typeof record.period_start !== "string" ||
    typeof record.period_end !== "string" ||
    typeof record.status !== "string" ||
    typeof record.source_filename !== "string"
  ) {
    throw new Error("Import invalide.");
  }

  return {
    agencyId: record.agency_id,
    id: record.id,
    invalidRowCount: toCount(record.invalid_row_count),
    periodEnd: record.period_end,
    periodStart: record.period_start,
    sourceFilename: record.source_filename,
    status: record.status,
    unknownEmployeeCount: toCount(record.unknown_employee_count),
    validRowCount: toCount(record.valid_row_count),
  };
}

async function loadPayrollImportErrors(
  supabase: { from: (table: string) => unknown },
  importId: string,
): Promise<ImportReportError[]> {
  const query = supabase.from("payroll_import_errors") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data, error } = await query
    .select("row_number,field_name,message")
    .eq("import_id", importId)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error("Impossible de charger les erreurs d'import.");
  }

  return ((data ?? []) as ImportErrorRecord[]).flatMap((row): ImportReportError[] => {
    if (
      typeof row.row_number !== "number" ||
      typeof row.field_name !== "string" ||
      typeof row.message !== "string"
    ) {
      return [];
    }

    return [
      {
        fieldName: row.field_name,
        message: row.message,
        rowNumber: row.row_number,
      },
    ];
  });
}

async function loadPayrollImportRows(
  supabase: { from: (table: string) => unknown },
  input: { agencyId: string; importId: string },
): Promise<PreviewRow[]> {
  const query = supabase.from("payroll_import_rows") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => { limit: (count: number) => Promise<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
  const { data, error } = await query
    .select("id,employee_id,employee_name,normalized_data,has_manual_adjustments,raw_unknown_columns")
    .eq("import_id", input.importId)
    .eq("agency_id", input.agencyId)
    .order("employee_name", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error("Impossible de charger les lignes d'import.");
  }

  return ((data ?? []) as ImportRowRecord[]).flatMap((row): PreviewRow[] => {
    if (
      typeof row.id !== "string" ||
      typeof row.employee_id !== "string" ||
      typeof row.employee_name !== "string"
    ) {
      return [];
    }

    const normalizedData = toRecord(row.normalized_data);

    return [
      {
        deductionsTotal: toCount(normalizedData.deductionsTotal),
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        grossAmount: toCount(normalizedData.grossAmount),
        hasManualAdjustments: row.has_manual_adjustments === true,
        id: row.id,
        netAmount: toCount(normalizedData.netAmount),
        rawUnknownColumns: toRecord(row.raw_unknown_columns),
      },
    ];
  });
}

async function loadMappedColumns(
  supabase: { from: (table: string) => unknown },
  agencyId: string,
  columns: string[],
): Promise<Set<string>> {
  if (columns.length === 0) return new Set();

  const query = supabase.from("column_mappings") as {
    select: (selectColumns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { in: (column: string, values: string[]) => Promise<{ data: unknown; error: unknown }> };
    };
  };
  const { data, error } = await query
    .select("source_column")
    .eq("agency_id", agencyId)
    .in("source_column", columns);

  if (error) {
    throw new Error("Impossible de charger les mappings de colonnes.");
  }

  return new Set(
    ((data ?? []) as Array<{ source_column?: unknown }>).flatMap((row) =>
      typeof row.source_column === "string" ? [row.source_column] : [],
    ),
  );
}

function ForbiddenManagerAccess() {
  return <AccessDenied context="Espace manager" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function uniqueSortedColumns(columns: string[]) {
  return Array.from(new Set(columns)).sort((left, right) => left.localeCompare(right));
}

function currentStepForStatus(status: string): number {
  if (status === "PUBLISHED" || status === "SUPERSEDED") return 5;
  if (status === "READY_FOR_PREVIEW") return 4;
  if (status === "NEEDS_MAPPING") return 1;
  return 2;
}
