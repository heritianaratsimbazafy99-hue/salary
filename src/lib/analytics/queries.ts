import type { SupabaseClient } from "@supabase/supabase-js";

export type PayrollAnalyticsRow = {
  agencyName: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
};

type SupabaseReadClient = Pick<SupabaseClient, "from">;

type PayrollAnalyticsDbRow = {
  agency_name?: unknown;
  deductions_total?: unknown;
  employee_id?: unknown;
  employee_name?: unknown;
  gross_amount?: unknown;
  net_amount?: unknown;
  period_end?: unknown;
  period_start?: unknown;
};

const PAYROLL_ANALYTICS_COLUMNS =
  "agency_name,employee_id,employee_name,period_start,period_end,gross_amount,deductions_total,net_amount";

export async function loadPayrollAnalyticsRows(
  supabase: SupabaseReadClient,
): Promise<PayrollAnalyticsRow[]> {
  const { data, error } = await supabase
    .from("payroll_analytics_rows")
    .select(PAYROLL_ANALYTICS_COLUMNS)
    .order("period_start", { ascending: false })
    .order("employee_name", { ascending: true });

  if (error) {
    throw new Error("Impossible de charger les analytics paie.");
  }

  return ((data ?? []) as PayrollAnalyticsDbRow[]).map(mapPayrollAnalyticsRow);
}

export function summarizeAnalytics(rows: PayrollAnalyticsRow[]) {
  return rows.reduce(
    (summary, row) => ({
      grossTotal: summary.grossTotal + row.grossAmount,
      netTotal: summary.netTotal + row.netAmount,
      employeeRows: summary.employeeRows + 1,
    }),
    { grossTotal: 0, netTotal: 0, employeeRows: 0 },
  );
}

function mapPayrollAnalyticsRow(row: PayrollAnalyticsDbRow): PayrollAnalyticsRow {
  return {
    agencyName: requiredString(row.agency_name),
    deductionsTotal: requiredNumber(row.deductions_total),
    employeeId: requiredString(row.employee_id),
    employeeName: requiredString(row.employee_name),
    grossAmount: requiredNumber(row.gross_amount),
    netAmount: requiredNumber(row.net_amount),
    periodEnd: requiredString(row.period_end),
    periodStart: requiredString(row.period_start),
  };
}

function requiredString(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error("Ligne analytics invalide.");
}

function requiredNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Ligne analytics invalide.");
}
