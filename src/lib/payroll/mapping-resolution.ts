import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { applyColumnMappings, type ColumnMapping } from "@/lib/payroll/mapping";
import { PAY_ITEM_CATEGORIES, type PayItemCategory } from "@/lib/payroll/schema";

type SupabaseMappingClient = Pick<SupabaseClient, "from">;

type PayrollImportRecord = {
  agency_id?: unknown;
  id?: unknown;
  status?: unknown;
};

type PayrollImportRowRecord = {
  agency_id?: unknown;
  id?: unknown;
  raw_unknown_columns?: unknown;
};

type ColumnMappingRecord = {
  display_label?: unknown;
  source_column?: unknown;
  target_category?: unknown;
};

export type ResolveColumnMappingInput = {
  displayLabel: string;
  sourceColumn: string;
  targetCategory: PayItemCategory;
};

export type ResolveColumnMappingResult = {
  importId: string;
  mappedColumnCount: number;
  status: "READY_FOR_PREVIEW";
};

export class ResolveMappingNotFoundError extends Error {}
export class ResolveMappingConflictError extends Error {
  constructor(readonly status: string) {
    super("Import cannot be mapped from its current status.");
  }
}
export class ResolveMappingValidationError extends Error {}

export async function resolveImportColumnMappings(input: {
  actor: AgencyScopedActor;
  createWriteSupabase: () => SupabaseMappingClient;
  importId: string;
  mappings: ResolveColumnMappingInput[];
  readSupabase: SupabaseMappingClient;
}): Promise<ResolveColumnMappingResult> {
  const payrollImport = await loadPayrollImport(input.readSupabase, input.importId);

  assertCanManagePayrollForAgency({
    actorAgencyId: input.actor.agencyId,
    requestedAgencyId: payrollImport.agencyId,
    role: input.actor.role,
  });

  if (payrollImport.status !== "NEEDS_MAPPING") {
    throw new ResolveMappingConflictError(payrollImport.status);
  }

  const rows = await loadPayrollImportRows(input.readSupabase, {
    agencyId: payrollImport.agencyId,
    importId: input.importId,
  });
  const unknownColumns = uniqueSortedColumns(rows.flatMap((row) => Object.keys(row.rawUnknownColumns)));
  const submittedMappings = normalizeMappings(input.mappings, unknownColumns);
  const existingMappings = await loadColumnMappings(input.readSupabase, payrollImport.agencyId);
  const combinedMappings = combineMappings(existingMappings, submittedMappings);
  const writeSupabase = input.createWriteSupabase();

  if (submittedMappings.length > 0) {
    await upsertColumnMappings(writeSupabase, {
      actorProfileId: input.actor.id,
      agencyId: payrollImport.agencyId,
      mappings: submittedMappings,
    });
  }

  for (const row of rows) {
    await updateImportRowPayItems(writeSupabase, {
      agencyId: payrollImport.agencyId,
      payItems: applyColumnMappings(row.rawUnknownColumns, combinedMappings),
      rowId: row.id,
    });
  }

  await markImportReadyForPreview(writeSupabase, {
    agencyId: payrollImport.agencyId,
    importId: input.importId,
  });

  return {
    importId: input.importId,
    mappedColumnCount: submittedMappings.length,
    status: "READY_FOR_PREVIEW",
  };
}

async function loadPayrollImport(supabase: SupabaseMappingClient, importId: string) {
  const { data, error } = await supabase
    .from("payroll_imports")
    .select("id,agency_id,status")
    .eq("id", importId)
    .single();

  const payrollImport = data as PayrollImportRecord | null;
  if (error || !payrollImport) {
    throw new ResolveMappingNotFoundError("Import introuvable.");
  }

  if (typeof payrollImport.agency_id !== "string" || typeof payrollImport.status !== "string") {
    throw new Error("Import invalide.");
  }

  return {
    agencyId: payrollImport.agency_id,
    status: payrollImport.status,
  };
}

async function loadPayrollImportRows(
  supabase: SupabaseMappingClient,
  input: { agencyId: string; importId: string },
) {
  const { data, error } = await supabase
    .from("payroll_import_rows")
    .select("id,agency_id,raw_unknown_columns")
    .eq("import_id", input.importId)
    .eq("agency_id", input.agencyId);

  if (error) {
    throw new Error("Impossible de charger les lignes d'import.");
  }

  return ((data ?? []) as PayrollImportRowRecord[]).map((row) => {
    if (typeof row.id !== "string") {
      throw new Error("Ligne d'import invalide.");
    }

    return {
      id: row.id,
      rawUnknownColumns: toRecord(row.raw_unknown_columns),
    };
  });
}

async function loadColumnMappings(
  supabase: SupabaseMappingClient,
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

function normalizeMappings(
  mappings: ResolveColumnMappingInput[],
  requiredColumns: string[],
): ColumnMapping[] {
  const mappingBySourceColumn = new Map<string, ColumnMapping>();
  const requiredColumnSet = new Set(requiredColumns);

  mappings.forEach((mapping) => {
    const sourceColumn = mapping.sourceColumn.trim();
    const displayLabel = mapping.displayLabel.trim();

    if (
      sourceColumn.length === 0 ||
      displayLabel.length === 0 ||
      !requiredColumnSet.has(sourceColumn) ||
      !isPayItemCategory(mapping.targetCategory)
    ) {
      throw new ResolveMappingValidationError("Mapping de colonne invalide.");
    }

    mappingBySourceColumn.set(sourceColumn, {
      displayLabel,
      sourceColumn,
      targetCategory: mapping.targetCategory,
    });
  });

  const missingColumns = requiredColumns.filter((column) => !mappingBySourceColumn.has(column));
  if (missingColumns.length > 0) {
    throw new ResolveMappingValidationError("Toutes les colonnes inconnues doivent etre mappees.");
  }

  return Array.from(mappingBySourceColumn.values());
}

function combineMappings(existingMappings: ColumnMapping[], submittedMappings: ColumnMapping[]) {
  const combined = new Map(existingMappings.map((mapping) => [mapping.sourceColumn, mapping]));
  submittedMappings.forEach((mapping) => {
    combined.set(mapping.sourceColumn, mapping);
  });
  return Array.from(combined.values());
}

async function upsertColumnMappings(
  supabase: SupabaseMappingClient,
  input: {
    actorProfileId: string;
    agencyId: string;
    mappings: ColumnMapping[];
  },
) {
  const { error } = await supabase.from("column_mappings").upsert(
    input.mappings.map((mapping) => ({
      agency_id: input.agencyId,
      created_by: input.actorProfileId,
      display_label: mapping.displayLabel,
      source_column: mapping.sourceColumn,
      target_category: mapping.targetCategory,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "agency_id,source_column" },
  );

  if (error) {
    throw new Error("Impossible d'enregistrer les mappings de colonnes.");
  }
}

async function updateImportRowPayItems(
  supabase: SupabaseMappingClient,
  input: {
    agencyId: string;
    payItems: unknown[];
    rowId: string;
  },
) {
  const { error } = await supabase
    .from("payroll_import_rows")
    .update({ pay_items: input.payItems })
    .eq("id", input.rowId)
    .eq("agency_id", input.agencyId);

  if (error) {
    throw new Error("Impossible de recalculer les elements de paie.");
  }
}

async function markImportReadyForPreview(
  supabase: SupabaseMappingClient,
  input: { agencyId: string; importId: string },
) {
  const { error } = await supabase
    .from("payroll_imports")
    .update({ status: "READY_FOR_PREVIEW" })
    .eq("id", input.importId)
    .eq("agency_id", input.agencyId);

  if (error) {
    throw new Error("Impossible de finaliser le mapping.");
  }
}

function uniqueSortedColumns(columns: string[]) {
  return Array.from(new Set(columns)).sort((left, right) => left.localeCompare(right));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPayItemCategory(value: unknown): value is PayItemCategory {
  return typeof value === "string" && (PAY_ITEM_CATEGORIES as readonly string[]).includes(value);
}
