import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/employee/payslips/export/route";

const employeePayslipsExportMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadEmployeePayslips: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: employeePayslipsExportMocks.createClient,
}));

vi.mock("@/lib/payslips/employee", () => ({
  loadEmployeePayslips: employeePayslipsExportMocks.loadEmployeePayslips,
}));

describe("GET /api/employee/payslips/export", () => {
  beforeEach(() => {
    employeePayslipsExportMocks.createClient.mockReset();
    employeePayslipsExportMocks.loadEmployeePayslips.mockReset();
  });

  it("neutralizes formula-leading values in employee payslip CSV exports", async () => {
    const supabase = {};
    employeePayslipsExportMocks.createClient.mockResolvedValue(supabase);
    employeePayslipsExportMocks.loadEmployeePayslips.mockResolvedValue([
      {
        deductionsTotal: 100000,
        employeeName: "=HYPERLINK",
        grossAmount: 1200000,
        id: "payslip-001",
        netAmount: 1100000,
        payItems: [
          {
            category: "BENEFIT",
            id: "item-001",
            label: "=HYPERLINK",
            text: "Prime transport",
          },
        ],
        periodEnd: "2026-06-30",
        periodLabel: "2026-06-01 - 2026-06-30",
        periodStart: "2026-06-01",
        publishedAt: "2026-06-30T08:00:00.000Z",
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(",=HYPERLINK");
    expect(csv).not.toContain("\n=HYPERLINK");
    expect(employeePayslipsExportMocks.loadEmployeePayslips).toHaveBeenCalledWith(supabase);
  });
});
