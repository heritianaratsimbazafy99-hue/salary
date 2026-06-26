import {
  PAYROLL_OPTIONAL_COLUMNS,
  PAYROLL_REQUIRED_COLUMNS,
  PayrollRowSchema,
  type ParsedPayrollRow,
  type PayrollRowError,
} from "@/lib/payroll/schema";

type RawRow = Record<string, unknown>;

const STANDARD_COLUMNS = new Set<string>([...PAYROLL_REQUIRED_COLUMNS, ...PAYROLL_OPTIONAL_COLUMNS]);

export type PayrollParseResult = {
  validRows: Extract<ParsedPayrollRow, { status: "valid" }>[];
  invalidRows: Extract<ParsedPayrollRow, { status: "invalid" }>[];
  unknownColumns: string[];
};

export function parsePayrollRowsFromObjects(rows: RawRow[]): PayrollParseResult {
  const validRows: PayrollParseResult["validRows"] = [];
  const invalidRows: PayrollParseResult["invalidRows"] = [];
  const unknownColumns = new Set<string>();

  rows.forEach((row, index) => {
    Object.keys(row).forEach((column) => {
      if (!STANDARD_COLUMNS.has(column)) unknownColumns.add(column);
    });

    const normalized = {
      employeeId: stringValue(row.employee_id),
      email: stringValue(row.email).toLowerCase(),
      periodStart: stringValue(row.period_start),
      periodEnd: stringValue(row.period_end),
      employeeName: stringValue(row.employee_name),
      role: optionalString(row.role),
      department: optionalString(row.department),
      contractType: optionalString(row.contract_type),
      baseSalary: optionalNumber(row.base_salary),
      hoursWorked: optionalNumber(row.hours_worked),
      overtimeHours: optionalNumber(row.overtime_hours),
      grossAmount: requiredNumber(row.gross_amount),
      deductionsTotal: requiredNumber(row.deductions_total),
      netAmount: requiredNumber(row.net_amount),
      paymentDate: optionalString(row.payment_date),
      notes: optionalString(row.notes),
    };

    const parsed = PayrollRowSchema.safeParse(normalized);
    if (parsed.success) {
      validRows.push({
        status: "valid",
        rowNumber: index + 2,
        data: parsed.data,
        unknownColumns: Object.fromEntries(Object.entries(row).filter(([key]) => !STANDARD_COLUMNS.has(key))),
      });
      return;
    }

    const errors: PayrollRowError[] = parsed.error.issues.map((issue) => {
      const fieldName = String(issue.path[0] ?? "row");
      return {
        fieldName,
        errorCode: issue.code,
        message: issue.message,
        rawValue: row[fieldName],
      };
    });

    invalidRows.push({ status: "invalid", rowNumber: index + 2, errors, raw: row });
  });

  return { validRows, invalidRows, unknownColumns: Array.from(unknownColumns).sort() };
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function optionalString(value: unknown): string | undefined {
  const text = stringValue(value);
  return text.length > 0 ? text : undefined;
}

function requiredNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  return requiredNumber(value);
}
