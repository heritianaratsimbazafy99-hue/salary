// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readPayrollWorkbook } from "@/lib/payroll/workbook-reader";

const period = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };
const airtelHeaders = ["Name", "Matricule", "Salaire de base", "Salaire Brut", "Salaire Net", "CNAPS 1%", "OSTIE 1%", "IRSA", "Déduction avance", "Total jour de travail", "Montant HS 130%", "Mode de paiement"];
const huaweiHeaders = ["ID", "HRMS OFFICAL NAME", "Actual basic salary", "Total of Gross Salary", "Net pay", "NP2", "CNaPS Employee 1%", "OSTIE Employee 1%", "Individual Income tax IRSA", "Cash advance", "CNaPs Employer 13%", "Allocation familiale"];

function file(sheet: XLSX.WorkSheet, name = "Recap global ", type: "xlsx" | "xls" = "xlsx", extra?: XLSX.WorkSheet) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  if (extra) XLSX.utils.book_append_sheet(workbook, extra, "Annexe");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: type === "xls" ? "biff8" : "xlsx" });
  return new File([bytes], `synthetic.${type}`);
}

describe("native payroll workbook reader", () => {
  it("reads Airtel headers with blank columns and preserves saved net and numeric informational quantities", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Title"], [], [null, ...airtelHeaders],
      [null, "Salarié fictif", "RT 001", 1000, 1200, 1400, 12, 12, 50, 100, 30, 200, "private account"],
      [null, "TOTAL", null, 1000, 1200, 1400],
    ]);
    const result = await readPayrollWorkbook(file(sheet), period);
    expect(result.format).toBe("airtel");
    expect(result.rowNumbers).toEqual([4]);
    expect(result.rows[0]).toMatchObject({ employee_id: "RT 001", net_amount: 1400, deductions_total: 174, period_start: "2026-09-01" });
    expect(result.payItemsByRow.get(4)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Total jour de travail", text: "30", category: "INFORMATIONAL_NOTE" }),
      expect.objectContaining({ label: "Montant HS 130%", amount: 200 }),
    ]));
    expect(result.payItemsByRow.get(4)?.some((item) => item.rawValue === "private account")).toBe(false);
  });

  it("reads a genuine Huawei XLS, uses NP2 including family allowance and excludes employer taxes from deductions", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([huaweiHeaders, ["00123", "Salarié fictif", 1000, 1200, 1000, 1050, 12, 12, 50, 100, 156, 50], [null, "TOTAL", null, 1200]]);
    const result = await readPayrollWorkbook(file(sheet, "SEPTEMBER", "xls"), period);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ employee_id: "00123", gross_amount: 1200, net_amount: 1050, deductions_total: 174 });
    expect(result.payItemsByRow.get(2)).toEqual(expect.arrayContaining([expect.objectContaining({ label: "CNaPs Employer 13%", text: "156", category: "INFORMATIONAL_NOTE" })]));
  });

  it("retains employees with missing matricules and records cached formula errors at source rows", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([airtelHeaders, ["Missing ID", null, 1000, 1200, 1000, 12, 12, 50, 0]]);
    sheet.E2 = { t: "e", v: 7, f: "1/0" };
    const result = await readPayrollWorkbook(file(sheet), period);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].employee_id).toBe("");
    expect(result.issuesByRow.get(2)?.[0]).toMatchObject({ fieldName: "Salaire Net", errorCode: "EXCEL_VALUE_UNAVAILABLE" });
  });

  it("preserves cached formula values without recalculating", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([airtelHeaders, ["Synthetic", "RT 001", 1000, 1200, 1000, 12, 12, 50, 0]]);
    sheet.E2 = { t: "n", v: 999, f: "D2-F2-G2-H2" };
    const result = await readPayrollWorkbook(file(sheet), period);
    expect(result.rows[0].net_amount).toBe(999);
  });

  it("reports corrupt identity cells instead of silently dropping their payroll row", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([airtelHeaders, ["Synthetic", "RT 001", 1000, 1200, 1000, 12, 12, 50, 0]]);
    sheet.A2 = { t: "e", v: 7 };
    sheet.B2 = { t: "e", v: 7 };
    const result = await readPayrollWorkbook(file(sheet), period);
    expect(result.rows).toHaveLength(1);
    expect(result.issuesByRow.get(2)).toHaveLength(2);
  });

  it("separates deductions from adjustments already included in gross and accepts changing Huawei period labels", async () => {
    const airtel = XLSX.utils.aoa_to_sheet([[...airtelHeaders, "PREAVIS A DEDUIRE"], ["Synthetic", "RT 001", 1000, 1200, 1000, 12, 12, 50, 0, 30, 200, "", 100]]);
    const a = await readPayrollWorkbook(file(airtel), period);
    expect(a.rows[0].deductions_total).toBe(74);
    expect(a.payItemsByRow.get(2)).toContainEqual(expect.objectContaining({ label: "PREAVIS A DEDUIRE", category: "INFORMATIONAL_NOTE", text: "100" }));
    const huawei = XLSX.utils.aoa_to_sheet([[...huaweiHeaders, "Total PO amount before TAX (August-September)", "Other Income (-)", "Lieu of notice payment"], ["00123", "Synthetic", 1000, 1200, 1000, 1050, 12, 12, 50, 0, 156, 50, 30, -100, 100]]);
    const h = await readPayrollWorkbook(file(huawei, "SEPTEMBER", "xls"), period);
    expect(h.rows[0].deductions_total).toBe(104);
    expect(h.payItemsByRow.get(2)).toContainEqual(expect.objectContaining({ label: "Other Income (-)", category: "INFORMATIONAL_NOTE", text: "-100" }));
    expect(h.payItemsByRow.get(2)).toContainEqual(expect.objectContaining({ label: "Lieu of notice payment", category: "INFORMATIONAL_NOTE", text: "100" }));
  });

  it("rejects ambiguous Huawei monthly worksheets", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([huaweiHeaders]);
    await expect(readPayrollWorkbook(file(sheet, "SEPTEMBER", "xls", sheet), period)).rejects.toThrow("ambiguë");
  });

  it("rejects period mismatch and renamed non-XLS content", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([huaweiHeaders]);
    await expect(readPayrollWorkbook(file(sheet, "OCTOBER", "xls"), period)).rejects.toThrow("période");
    await expect(readPayrollWorkbook(new File(["<table>fake</table>"], "fake.xls"), period)).rejects.toThrow("binaire");
  });

  it("rejects duplicate required headers", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([[...airtelHeaders, " Matricule "]]);
    await expect(readPayrollWorkbook(file(sheet), period)).rejects.toThrow("dupliqué");
  });

  it("preserves standard header positions across empty columns", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["employee_id", null, "email"], ["EMP-001", null, "employee@example.com"]]);
    const result = await readPayrollWorkbook(file(sheet, "payroll"), period);
    expect(result.rows).toEqual([{ employee_id: "EMP-001", email: "employee@example.com" }]);
  });
});
