const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/;

export type CsvCellValue = number | string;

export function toCsv(headers: string[], rows: CsvCellValue[][]): string {
  return [[...headers], ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function csvCell(value: CsvCellValue): string {
  if (typeof value === "number") return String(value);

  const neutralized = FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
  const escaped = neutralized.replace(/"/g, '""');
  return /[",\n\r;]/.test(escaped) ? `"${escaped}"` : escaped;
}
