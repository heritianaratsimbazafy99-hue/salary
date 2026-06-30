import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { applyColumnMappings, type ColumnMapping } from "@/lib/payroll/mapping";
import { parsePayrollRowsFromObjects } from "@/lib/payroll/parser";
import { PAY_ITEM_CATEGORIES, type PayItemCategory, type PayrollRowError } from "@/lib/payroll/schema";
import { assertSafeXlsxContainer } from "@/lib/payroll/xlsx-guard";

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

const MAX_USEFUL_PAYROLL_ROWS = 2000;

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
};

class PayrollImportParseError extends Error {}

const MAX_PAYROLL_WORKSHEET_COLUMNS = 128;

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

  let worksheetRows: RawRow[];
  try {
    worksheetRows = await readPayrollWorksheetRows(input.file);
  } catch {
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

  const parseResult = parsePayrollRowsFromObjects(worksheetRows);
  const periodValidationResult = validateRowsMatchImportPeriod(parseResult.validRows, {
    periodEnd: input.periodEnd,
    periodStart: input.periodStart,
  });
  const hasValidRows = periodValidationResult.validRows.length > 0;
  const mappings = await loadColumnMappings(input.supabase, input.agencyId);
  const mappedColumns = new Set(mappings.map((mapping) => mapping.sourceColumn));
  const unmappedUnknownColumns = hasValidRows
    ? parseResult.unknownColumns.filter((column) => !mappedColumns.has(column))
    : [];
  const unknownEmployeeIds = await findUnknownEmployeeIds(
    input.supabase,
    input.agencyId,
    periodValidationResult.validRows.map((row) => row.data.employeeId),
  );
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
    pay_items: applyColumnMappings(row.unknownColumns, mappings),
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

async function readPayrollWorksheetRows(file: File): Promise<RawRow[]> {
  await assertSafeXlsxContainer(file);

  const workbook = new ExcelJS.Workbook();
  const buffer = (await file.arrayBuffer()) as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet("payroll");
  if (!worksheet) {
    throw new PayrollImportParseError("Worksheet payroll is required.");
  }

  const headers = readHeaderRow(worksheet);
  if (headers.length === 0) {
    throw new PayrollImportParseError("Payroll worksheet headers are required.");
  }

  const rows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rowObject = Object.fromEntries(
      headers.map((header, index) => [header, normalizeExcelCellValue(row.getCell(index + 1).value)]),
    );

    if (Object.values(rowObject).some(hasMeaningfulCellValue)) {
      if (rows.length >= MAX_USEFUL_PAYROLL_ROWS) {
        throw new PayrollImportParseError("Payroll worksheet exceeds the 2000 row limit.");
      }

      rows.push(rowObject);
    }
  });

  return rows;
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

function readHeaderRow(worksheet: ExcelJS.Worksheet): string[] {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  if (headerRow.cellCount > MAX_PAYROLL_WORKSHEET_COLUMNS) {
    throw new PayrollImportParseError("Payroll worksheet exceeds the column limit.");
  }

  for (let columnIndex = 1; columnIndex <= headerRow.cellCount; columnIndex += 1) {
    const header = normalizeExcelCellValue(headerRow.getCell(columnIndex).value);
    headers.push(typeof header === "string" ? header.trim() : String(header).trim());
  }

  return headers.filter((header) => header.length > 0);
}

function normalizeExcelCellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return "";
  if (value instanceof Date) return formatExcelDate(value);
  if (typeof value !== "object") return value;

  if ("result" in value) {
    return normalizeExcelCellValue(value.result as ExcelJS.CellValue);
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }

  return String(value);
}

function formatExcelDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasMeaningfulCellValue(value: unknown): boolean {
  return value != null && String(value).trim().length > 0;
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

async function findUnknownEmployeeIds(
  supabase: SupabaseWriteClient,
  agencyId: string,
  employeeIds: string[],
): Promise<string[]> {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds));
  if (uniqueEmployeeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("employees")
    .select("employee_id")
    .eq("agency_id", agencyId)
    .in("employee_id", uniqueEmployeeIds);

  if (error) {
    throw new Error("Impossible de verifier les employes existants.");
  }

  const knownEmployeeIds = new Set(
    ((data ?? []) as EmployeeRecord[])
      .map((employee) => employee.employee_id)
      .filter((employeeId): employeeId is string => typeof employeeId === "string"),
  );

  return uniqueEmployeeIds.filter((employeeId) => !knownEmployeeIds.has(employeeId));
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
