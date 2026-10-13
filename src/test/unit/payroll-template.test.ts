import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildPayrollTemplate } from "@/lib/payroll/template";
import { PAYROLL_REQUIRED_COLUMNS, PAYROLL_OPTIONAL_COLUMNS } from "@/lib/payroll/schema";

describe("payroll import template", () => {
  it("provides the actual parser columns in a blank payroll worksheet with no accidental recipients", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildPayrollTemplate());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["payroll"]);
    const sheet = workbook.getWorksheet("payroll")!;
    expect(sheet.rowCount).toBe(1);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...PAYROLL_REQUIRED_COLUMNS, ...PAYROLL_OPTIONAL_COLUMNS]);
    expect(sheet.getColumn(1).numFmt).toBe("@");
  });
});
