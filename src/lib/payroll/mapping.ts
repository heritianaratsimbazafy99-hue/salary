import type { PayItemCategory } from "@/lib/payroll/schema";

export type ColumnMapping = {
  sourceColumn: string;
  targetCategory: PayItemCategory;
  displayLabel: string;
};

export type PayItem = {
  label: string;
  category: PayItemCategory;
  amount?: number;
  text?: string;
  rawValue: unknown;
};

export function applyColumnMappings(
  unknownColumns: Record<string, unknown>,
  mappings: ColumnMapping[],
): PayItem[] {
  const mappingByColumn = new Map(mappings.map((mapping) => [mapping.sourceColumn, mapping]));

  return Object.entries(unknownColumns).flatMap(([column, rawValue]) => {
    const mapping = mappingByColumn.get(column);
    if (!mapping) return [];

    const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);

    return [
      {
        label: mapping.displayLabel,
        category: mapping.targetCategory,
        amount: Number.isFinite(numericValue) ? numericValue : undefined,
        text: Number.isFinite(numericValue) ? undefined : String(rawValue),
        rawValue,
      },
    ];
  });
}
