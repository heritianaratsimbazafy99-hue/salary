import ExcelJS from "exceljs";

import { PAYROLL_REQUIRED_COLUMNS, PAYROLL_OPTIONAL_COLUMNS } from "./schema";

/** Blank workbook: downloading a template must never create fictitious recipients. */
export async function buildPayrollTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MadajobPay";
  const sheet = workbook.addWorksheet("payroll", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = [...PAYROLL_REQUIRED_COLUMNS, ...PAYROLL_OPTIONAL_COLUMNS];
  sheet.addRow(columns);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF185C78" } };
  sheet.getRow(1).height = 28;
  columns.forEach((name, index) => {
    sheet.getColumn(index + 1).width = Math.max(20, name.length + 3);
    sheet.getColumn(index + 1).numFmt = ["employee_id", "email", "period_start", "period_end", "payment_date"].includes(name) ? "@" : "General";
    sheet.getCell(1, index + 1).note = PAYROLL_REQUIRED_COLUMNS.some((required) => required === name)
      ? "Colonne obligatoire. Dates au format AAAA-MM-JJ ; montants numériques en Ariary."
      : "Colonne facultative. Ne changez pas le nom de l’en-tête.";
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer;
}
