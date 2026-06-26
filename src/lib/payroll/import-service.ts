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

export function buildImportSummary(input: ImportSummaryInput): ImportSummary {
  return {
    validRowCount: input.validRows.length,
    invalidRowCount: input.invalidRows.length,
    unknownEmployeeCount: input.unknownEmployeeIds.length,
  };
}
