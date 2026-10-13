import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildExportWorkbook } from "@/lib/exports/workbook";
vi.mock("server-only", () => ({}));

describe("Excel export", () => {
  it("stores untrusted formula-like strings as text and amounts as numbers", async () => {
    const bytes = await buildExportWorkbook([{ agencyId: "agency", agencyName: "Agence", employeeId: "EMP01", employeeName: '=HYPERLINK("https://example.test")', grossAmount: 12.5, deductionsTotal: 1.25, netAmount: 11.25, periodStart: "2026-06-01", periodEnd: "2026-06-30", publishedAt: "2026-06-30" }], "PUBLISHED_PAYSLIPS");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("D2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("D2").value).toBe('=HYPERLINK("https://example.test")');
    expect(sheet.getCell("G2").value).toBe(12.5);
    expect(sheet.getCell("I2").value).toBe(11.25);
    expect(sheet.getCell("D2").formula).toBeUndefined();
  });
});
