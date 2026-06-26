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
