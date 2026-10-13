import "server-only";
import ExcelJS from "exceljs";
import type { ImportReportExportRow, PublishedPayslipExportRow } from "@/lib/payroll/export";

export async function buildExportWorkbook(rows: ImportReportExportRow[] | PublishedPayslipExportRow[], type: "IMPORT_REPORT" | "PUBLISHED_PAYSLIPS"): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = "Salary";
  const sheet = book.addWorksheet(type === "IMPORT_REPORT" ? "Imports" : "Fiches publiées");
  const keys = type === "IMPORT_REPORT"
    ? ["id", "agencyId", "periodStart", "periodEnd", "status", "sourceFilename", "validRowCount", "invalidRowCount", "unknownEmployeeCount", "createdAt"]
    : ["agencyId", "agencyName", "employeeId", "employeeName", "periodStart", "periodEnd", "grossAmount", "deductionsTotal", "netAmount", "publishedAt"];
  sheet.columns = keys.map((key) => ({ header: key, key, width: 24 }));
  for (const row of rows) {
    // Assign primitive strings, never ExcelJS formula/hyperlink objects.
    sheet.addRow(keys.map((key) => (row as Record<string, string | number>)[key]));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
