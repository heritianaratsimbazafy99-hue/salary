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

function parseMappedAmount(rawValue: unknown): number | undefined {
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : undefined;
  }

  if (typeof rawValue === "string") {
    const trimmedValue = rawValue.trim();
    if (trimmedValue.length === 0) return undefined;

    const numericValue = Number(trimmedValue);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  return undefined;
}

export function applyColumnMappings(
  unknownColumns: Record<string, unknown>,
  mappings: ColumnMapping[],
): PayItem[] {
  const mappingByColumn = new Map(mappings.map((mapping) => [mapping.sourceColumn, mapping]));

  return Object.entries(unknownColumns).flatMap(([column, rawValue]): PayItem[] => {
    const mapping = mappingByColumn.get(column);
    if (!mapping) return [];

    const amount = parseMappedAmount(rawValue);

    if (amount !== undefined) {
      return [
        {
          label: mapping.displayLabel,
          category: mapping.targetCategory,
          amount,
          rawValue,
        },
      ];
    }

    return [
      {
        label: mapping.displayLabel,
        category: mapping.targetCategory,
        text: String(rawValue),
        rawValue,
      },
    ];
  });
}
