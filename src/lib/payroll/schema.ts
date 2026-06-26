import { z } from "zod";

export const PAYROLL_REQUIRED_COLUMNS = [
  "employee_id",
  "email",
  "period_start",
  "period_end",
  "employee_name",
  "gross_amount",
  "deductions_total",
  "net_amount",
] as const;

export const PAYROLL_OPTIONAL_COLUMNS = [
  "role",
  "department",
  "contract_type",
  "base_salary",
  "hours_worked",
  "overtime_hours",
  "payment_date",
  "notes",
] as const;

export const PAY_ITEM_CATEGORIES = [
  "BASE_PAY",
  "HOURS",
  "OVERTIME",
  "BONUS",
  "ABSENCE",
  "DEDUCTION",
  "BENEFIT",
  "INFORMATIONAL_NOTE",
  "OTHER_ELEMENTS",
] as const;

export type PayItemCategory = (typeof PAY_ITEM_CATEGORIES)[number];

export const PayrollRowSchema = z.object({
  employeeId: z.string().min(1),
  email: z.email(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  employeeName: z.string().min(1),
  role: z.string().optional(),
  department: z.string().optional(),
  contractType: z.string().optional(),
  baseSalary: z.number().nonnegative().optional(),
  hoursWorked: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative(),
  deductionsTotal: z.number().nonnegative(),
  netAmount: z.number(),
  paymentDate: z.iso.date().optional(),
  notes: z.string().max(1000).optional(),
});

export type PayrollRow = z.infer<typeof PayrollRowSchema>;

export type ParsedPayrollRow =
  | { status: "valid"; rowNumber: number; data: PayrollRow; unknownColumns: Record<string, unknown> }
  | { status: "invalid"; rowNumber: number; errors: PayrollRowError[]; raw: Record<string, unknown> };

export type PayrollRowError = {
  fieldName: string;
  errorCode: string;
  message: string;
  rawValue: unknown;
};
