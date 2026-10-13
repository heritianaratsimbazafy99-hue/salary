import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { persistPayrollImport } from "@/lib/payroll/import-service";

describe("ExcelJS dependency compatibility", () => {
  it("imports a formatted payroll workbook without changing dates, employee identity or calculated pay", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("payroll");
    sheet.addRow([
      "employee_id", "email", "period_start", "period_end", "employee_name",
      "gross_amount", "deductions_total", "net_amount",
    ]);
    sheet.addRow([
      "EMP-001",
      { text: "employee@example.com", hyperlink: "mailto:employee@example.com" },
      new Date(2026, 5, 1),
      new Date(2026, 5, 30),
      { richText: [{ font: { bold: true }, text: "Élodie " }, { text: "Rabe" }] },
      1200000.5,
      100000.25,
      { formula: "F2-G2", result: 1100000.25 },
    ]);
    sheet.getCell("C2").numFmt = "yyyy-mm-dd";
    sheet.getCell("D2").numFmt = "yyyy-mm-dd";
    // Extended conditional formatting exercises ExcelJS's CommonJS UUID v4
    // integration, which a simple unformatted XLSX round trip never invokes.
    sheet.addConditionalFormatting({
      ref: "H2:H2",
      rules: [{
        type: "dataBar",
        priority: 1,
        gradient: false,
        cfvo: [{ type: "min" }, { type: "max" }],
      }],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer as BlobPart], "formatted-payroll.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const insertedRows: Record<string, unknown>[] = [];
    const from = vi.fn((table: string) => {
      if (table === "column_mappings") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      if (table === "employees") {
        return { select: () => ({ eq: () => ({ in: async () => ({
          data: [{ employee_id: "EMP-001" }], error: null,
        }) }) }) };
      }
      if (table === "payroll_imports") {
        return { insert: () => ({ select: () => ({ single: async () => ({
          data: { id: "import-formatted" }, error: null,
        }) }) }) };
      }
      if (table === "payroll_import_rows") {
        return { insert: async (rows: Record<string, unknown>[]) => {
          insertedRows.push(...rows);
          return { error: null };
        } };
      }
      throw new Error(`Unexpected database table: ${table}`);
    });

    const result = await persistPayrollImport({
      actor: { id: "manager", role: "agency_manager", agencyId: "agency" },
      agencyId: "agency",
      file,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      supabase: { from } as unknown as Parameters<typeof persistPayrollImport>[0]["supabase"],
    });

    expect(result).toMatchObject({
      status: "READY_FOR_PREVIEW",
      validRowCount: 1,
      invalidRowCount: 0,
      unknownEmployeeCount: 0,
    });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      employee_id: "EMP-001",
      employee_email: "employee@example.com",
      employee_name: "Élodie Rabe",
      normalized_data: {
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        grossAmount: 1200000.5,
        deductionsTotal: 100000.25,
        netAmount: 1100000.25,
      },
    });
  });
});
