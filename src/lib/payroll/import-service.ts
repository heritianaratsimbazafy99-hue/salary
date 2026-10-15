import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { canonicalEmployeeId } from "@/lib/employees/identity";
import { applyColumnMappings, type ColumnMapping } from "@/lib/payroll/mapping";
import { parsePayrollRowsFromObjects } from "@/lib/payroll/parser";
import { PAY_ITEM_CATEGORIES, type PayItemCategory, type PayrollRowError } from "@/lib/payroll/schema";
import { readPayrollWorkbook, PayrollWorkbookError, type PayrollWorkbook } from "@/lib/payroll/workbook-reader";

export type ImportSummaryInput = {
  validRows: { employeeId: string }[];
  invalidRows: { rowNumber: number }[];
  unknownEmployeeIds: string[];
};

export type ImportSummary = {
  validRowCount: number;
  invalidRowCount: number;
  unknownEmployeeCount: number;
};

export type PayrollImportStatus = "NEEDS_MAPPING" | "READY_FOR_PREVIEW" | "FAILED";

export type PersistedPayrollImportSummary = ImportSummary & {
  importId: string;
  status: PayrollImportStatus;
  unknownColumns: string[];
  rowCount: number;
};

type SupabaseWriteClient = Pick<SupabaseClient, "from">;
type RawRow = Record<string, unknown>;

type ImportRecord = {
  id?: unknown;
};

type ColumnMappingRecord = {
  display_label?: unknown;
  source_column?: unknown;
  target_category?: unknown;
};

type EmployeeRecord = {
  employee_id?: unknown;
  email?: unknown;
  is_active?: unknown;
};

export function buildImportSummary(input: ImportSummaryInput): ImportSummary {
  return {
    validRowCount: input.validRows.length,
    invalidRowCount: input.invalidRows.length,
    unknownEmployeeCount: input.unknownEmployeeIds.length,
  };
}

export async function persistPayrollImport(input: {
  actor: AgencyScopedActor;
  agencyId: string;
  file: File;
  periodEnd: string;
  periodStart: string;
  supabase: SupabaseWriteClient;
}): Promise<PersistedPayrollImportSummary> {
  const filename = normalizedFilename(input.file.name);

  let workbook: PayrollWorkbook;
  try {
    workbook = await readPayrollWorkbook(input.file, input);
  } catch (error) {
    const importId = await insertImportRecord(input.supabase, {
      agencyId: input.agencyId,
      filename,
      invalidRowCount: 0,
      periodEnd: input.periodEnd,
      periodStart: input.periodStart,
      status: "FAILED",
      unknownEmployeeCount: 0,
      uploadedBy: input.actor.id,
      validRowCount: 0,
    });

    const { error: insertError } = await input.supabase.from("payroll_import_errors").insert([{
      import_id: importId, row_number: 1, field_name: "file", error_code: "INVALID_WORKBOOK",
      message: error instanceof PayrollWorkbookError ? error.message : "Classeur illisible ou trop complexe. Vérifiez le format et les limites du fichier.", raw_value: null,
    }]);
    if (insertError) throw new Error("Impossible d’enregistrer l’erreur du classeur.");

    return {
      importId,
      invalidRowCount: 0,
      rowCount: 0,
      status: "FAILED",
      unknownColumns: [],
      unknownEmployeeCount: 0,
      validRowCount: 0,
    };
  }

  const worksheetRows = workbook.rows;
  let nativeIdentities: EmployeeRecord[] | undefined;
  if (workbook.format !== "standard") {
    nativeIdentities = await loadEmployeeIdentities(input.supabase, input.agencyId, worksheetRows.map((row) => ({
      employeeId: canonicalEmployeeId(String(row.employee_id ?? "")), email: String(row.email ?? "").trim().toLowerCase(),
    })));
    const byId = new Map(nativeIdentities.map((employee) => [employee.employee_id, employee]));
    for (const row of worksheetRows) {
      const id = canonicalEmployeeId(String(row.employee_id ?? ""));
      if (!String(row.email ?? "").trim()) row.email = byId.get(id)?.email ?? "";
    }
  }
  const parseResult = parsePayrollRowsFromObjects(worksheetRows);
  for (const row of [...parseResult.validRows, ...parseResult.invalidRows]) {
    row.rowNumber = workbook.rowNumbers[row.rowNumber - 2];
    if (row.status === "invalid" && workbook.format !== "standard") {
      for (const error of row.errors) {
        if (error.fieldName === "email") error.message = "Email absent ou invalide. Créez ou complétez le dossier RH de ce matricule dans cette agence, ou ajoutez une colonne email au fichier.";
        if (error.fieldName === "employeeId") error.message = "Matricule absent ou invalide. Complétez cette ligne dans le fichier source.";
      }
    }
  }
  parseResult.validRows = parseResult.validRows.filter((row) => {
    const issues = workbook.issuesByRow.get(row.rowNumber);
    if (!issues) return true;
    parseResult.invalidRows.push({ status: "invalid", rowNumber: row.rowNumber, raw: row.data, errors: issues });
    return false;
  });
  for (const row of parseResult.invalidRows) {
    const issues = workbook.issuesByRow.get(row.rowNumber);
    if (issues && row.errors !== issues) row.errors.push(...issues);
  }
  const periodResult = validateRowsMatchImportPeriod(parseResult.validRows, {
    periodEnd: input.periodEnd,
    periodStart: input.periodStart,
  });
  const identities = nativeIdentities ?? await loadEmployeeIdentities(input.supabase, input.agencyId, periodResult.validRows.map((row) => row.data));
  const identityResult = validateEmployeeIdentities(periodResult.validRows, identities);
  const periodValidationResult = {
    validRows: identityResult.validRows,
    invalidRows: [...periodResult.invalidRows, ...identityResult.invalidRows],
  };
  const hasValidRows = periodValidationResult.validRows.length > 0;
  const mappings = await loadColumnMappings(input.supabase, input.agencyId);
  const mappedColumns = new Set(mappings.map((mapping) => mapping.sourceColumn));
  const unmappedUnknownColumns = hasValidRows
    ? parseResult.unknownColumns.filter((column) => !mappedColumns.has(column))
    : [];
  const knownIds = new Set(identities.map((employee) => employee.employee_id));
  const unknownEmployeeIds = [...new Set(periodValidationResult.validRows.map((row) => row.data.employeeId))].filter((id) => !knownIds.has(id));
  const status: PayrollImportStatus =
    !hasValidRows ? "FAILED" : unmappedUnknownColumns.length > 0 ? "NEEDS_MAPPING" : "READY_FOR_PREVIEW";

  const importId = await insertImportRecord(input.supabase, {
    agencyId: input.agencyId,
    filename,
    invalidRowCount: parseResult.invalidRows.length + periodValidationResult.invalidRows.length,
    periodEnd: input.periodEnd,
    periodStart: input.periodStart,
    status,
    unknownEmployeeCount: unknownEmployeeIds.length,
    uploadedBy: input.actor.id,
    validRowCount: periodValidationResult.validRows.length,
  });

  const validImportRows = periodValidationResult.validRows.map((row) => ({
    agency_id: input.agencyId,
    employee_email: row.data.email.toLowerCase(),
    employee_id: row.data.employeeId,
    employee_name: row.data.employeeName,
    has_manual_adjustments: false,
    import_id: importId,
    manual_adjustments: {},
    normalized_data: row.data,
    pay_items: workbook.payItemsByRow.get(row.rowNumber) ?? applyColumnMappings(row.unknownColumns, mappings),
    raw_unknown_columns: row.unknownColumns,
  }));

  if (validImportRows.length > 0) {
    const { error } = await input.supabase.from("payroll_import_rows").insert(validImportRows);
    if (error) {
      throw new Error("Impossible d'enregistrer les lignes d'import.");
    }
  }

  const invalidImportRows = [...parseResult.invalidRows, ...periodValidationResult.invalidRows];
  const invalidImportErrors = invalidImportRows.flatMap((row) =>
    row.errors.map((error) => ({
      error_code: error.errorCode,
      field_name: error.fieldName,
      import_id: importId,
      message: error.message,
      raw_value: rawValueToText(error.rawValue),
      row_number: row.rowNumber,
    })),
  );

  if (invalidImportErrors.length > 0) {
    const { error } = await input.supabase.from("payroll_import_errors").insert(invalidImportErrors);
    if (error) {
      throw new Error("Impossible d'enregistrer les erreurs d'import.");
    }
  }

  return {
    importId,
    invalidRowCount: invalidImportRows.length,
    rowCount: worksheetRows.length,
    status,
    unknownColumns: unmappedUnknownColumns,
    unknownEmployeeCount: unknownEmployeeIds.length,
    validRowCount: periodValidationResult.validRows.length,
  };
}

function validateRowsMatchImportPeriod(
  rows: ReturnType<typeof parsePayrollRowsFromObjects>["validRows"],
  period: { periodEnd: string; periodStart: string },
) {
  const validRows: ReturnType<typeof parsePayrollRowsFromObjects>["validRows"] = [];
  const invalidRows: Array<{
    errors: PayrollRowError[];
    raw: RawRow;
    rowNumber: number;
    status: "invalid";
  }> = [];

  rows.forEach((row) => {
    const errors: PayrollRowError[] = [];

    if (row.data.periodStart !== period.periodStart) {
      errors.push({
        errorCode: "period_mismatch",
        fieldName: "periodStart",
        message: "La periode de debut de la ligne ne correspond pas a la periode d'import.",
        rawValue: row.data.periodStart,
      });
    }

    if (row.data.periodEnd !== period.periodEnd) {
      errors.push({
        errorCode: "period_mismatch",
        fieldName: "periodEnd",
        message: "La periode de fin de la ligne ne correspond pas a la periode d'import.",
        rawValue: row.data.periodEnd,
      });
    }

    if (errors.length === 0) {
      validRows.push(row);
      return;
    }

    invalidRows.push({
      errors,
      raw: row.data,
      rowNumber: row.rowNumber,
      status: "invalid",
    });
  });

  return { invalidRows, validRows };
}

async function loadColumnMappings(
  supabase: SupabaseWriteClient,
  agencyId: string,
): Promise<ColumnMapping[]> {
  const { data, error } = await supabase
    .from("column_mappings")
    .select("source_column,target_category,display_label")
    .eq("agency_id", agencyId);

  if (error) {
    throw new Error("Impossible de charger les mappings de colonnes.");
  }

  return ((data ?? []) as ColumnMappingRecord[]).flatMap((record): ColumnMapping[] => {
    if (
      typeof record.source_column !== "string" ||
      typeof record.display_label !== "string" ||
      !isPayItemCategory(record.target_category)
    ) {
      return [];
    }

    return [
      {
        displayLabel: record.display_label,
        sourceColumn: record.source_column,
        targetCategory: record.target_category,
      },
    ];
  });
}

type ValidImportRow = ReturnType<typeof parsePayrollRowsFromObjects>["validRows"][number];

async function loadEmployeeIdentities(supabase: SupabaseWriteClient, agencyId: string, rows: { employeeId: string; email: string }[]): Promise<EmployeeRecord[]> {
  const employees: EmployeeRecord[] = [];
  for (const [column, values] of [
    ["employee_id", rows.map((row) => row.employeeId)],
    ["email", rows.map((row) => row.email)],
  ] as const) {
    const batches: string[][] = [];
    let batch: string[] = [];
    let encodedLength = 0;
    for (const value of new Set(values.filter(Boolean))) {
      const length = encodeURIComponent(JSON.stringify(value)).length + 3;
      if (batch.length && (batch.length >= 100 || encodedLength + length > 4000)) {
        batches.push(batch); batch = []; encodedLength = 0;
      }
      batch.push(value); encodedLength += length;
    }
    if (batch.length) batches.push(batch);
    for (const values of batches) {
      const { data, error } = await supabase.from("employees")
        .select("employee_id,email,is_active").eq("agency_id", agencyId).in(column, values);
      if (error) throw new Error("Impossible de vérifier les identités des salariés.");
      employees.push(...((data ?? []) as EmployeeRecord[]));
    }
  }
  return employees;
}

export function validateEmployeeIdentities(rows: ValidImportRow[], employees: EmployeeRecord[]) {
  const byId = new Map(employees.map((employee) => [employee.employee_id, employee]));
  const byEmail = new Map(employees.filter((employee) => typeof employee.email === "string")
    .map((employee) => [(employee.email as string).toLowerCase(), employee]));
  const idCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const row of rows) {
    idCounts.set(row.data.employeeId, (idCounts.get(row.data.employeeId) ?? 0) + 1);
    emailCounts.set(row.data.email, (emailCounts.get(row.data.email) ?? 0) + 1);
  }
  const validRows: ValidImportRow[] = [];
  const invalidRows: ReturnType<typeof parsePayrollRowsFromObjects>["invalidRows"] = [];
  for (const row of rows) {
    const employee = byId.get(row.data.employeeId);
    const emailOwner = byEmail.get(row.data.email);
    const message = (idCounts.get(row.data.employeeId) ?? 0) > 1 ? "Matricule présent plusieurs fois dans le fichier. Conservez une seule ligne par salarié."
      : (emailCounts.get(row.data.email) ?? 0) > 1 ? "Email présent sur plusieurs lignes. Vérifiez les identités des salariés."
      : employee?.is_active === false ? "Salarié désactivé. Une réactivation RH est nécessaire avant un nouvel import."
      : employee && typeof employee.email === "string" && employee.email.toLowerCase() !== row.data.email ? "Cet email diffère du dossier salarié. Faites vérifier son identité avant de réimporter."
      : emailOwner && emailOwner.employee_id !== row.data.employeeId ? "Cet email appartient à un autre matricule de l’agence. Vérifiez le matricule avant de réimporter."
      : null;
    if (!message) validRows.push(row);
    else invalidRows.push({ status: "invalid", rowNumber: row.rowNumber, raw: row.data,
      errors: [{ fieldName: "employeeId", errorCode: "IDENTITY_CONFLICT", message, rawValue: row.data.employeeId }] });
  }
  return { validRows, invalidRows };
}

async function insertImportRecord(
  supabase: SupabaseWriteClient,
  input: {
    agencyId: string;
    filename: string;
    invalidRowCount: number;
    periodEnd: string;
    periodStart: string;
    status: PayrollImportStatus;
    unknownEmployeeCount: number;
    uploadedBy: string;
    validRowCount: number;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("payroll_imports")
    .insert({
      agency_id: input.agencyId,
      invalid_row_count: input.invalidRowCount,
      period_end: input.periodEnd,
      period_start: input.periodStart,
      source_filename: input.filename,
      status: input.status,
      unknown_employee_count: input.unknownEmployeeCount,
      uploaded_by: input.uploadedBy,
      valid_row_count: input.validRowCount,
    })
    .select("id")
    .single();

  const importRecord = data as ImportRecord | null;
  if (error || typeof importRecord?.id !== "string") {
    throw new Error("Impossible d'enregistrer l'import.");
  }

  return importRecord.id;
}

function normalizedFilename(filename: string): string {
  const trimmedFilename = filename.trim();
  return trimmedFilename.length > 0 ? trimmedFilename : "payroll.xlsx";
}

function rawValueToText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function isPayItemCategory(value: unknown): value is PayItemCategory {
  return typeof value === "string" && (PAY_ITEM_CATEGORIES as readonly string[]).includes(value);
}
