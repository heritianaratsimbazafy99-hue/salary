import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { toPayslipDocumentModel } from "@/lib/payslips/document-model";
import { renderEmployeePayslipPdf, renderPayslipsPdf } from "@/lib/payslips/pdf";
import type { EmployeePayslip } from "@/lib/payslips/employee";
vi.mock("server-only", () => ({}));

const payslip: EmployeePayslip = {
  id: "fiche-1", employeeName: "Élodie Rakoto", periodStart: "2026-06-01", periodEnd: "2026-06-30", periodLabel: "Juin 2026", publishedAt: "2026-06-30T10:00:00Z",
  grossAmount: 2500.75, deductionsTotal: 500.25, netAmount: 2000.5,
  payItems: [{ id: "1", label: "Salaire", category: "gain", amount: 2500.75 }, { id: "2", label: "Remarque", category: "information", text: "Présence complète" }],
};

describe("payslip document and PDF", () => {
  it("preserves exact data and copies pay items", () => {
    const model = toPayslipDocumentModel(payslip);
    expect(model).toMatchObject(payslip);
    expect(model.companyLabel).toBe("Fiche de paie interne");
    expect(model.payItems).not.toBe(payslip.payItems);
  });
  it("handles no pay items and renders a real PDF", async () => {
    const bytes = await renderEmployeePayslipPdf({ ...payslip, payItems: [] });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
  });
  it("paginates long rubrics and separates employees", async () => {
    const long = { ...payslip, payItems: Array.from({ length: 80 }, (_, index) => ({ id: String(index), category: "information", label: `Rubrique ${index}`, text: "Texte détaillé ".repeat(10) })) };
    const bytes = await renderPayslipsPdf([long, payslip]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });
  it("rejects unrepresentable text without silently replacing names", async () => {
    await expect(renderEmployeePayslipPdf({ ...payslip, employeeName: "社員" })).rejects.toThrow("caractère");
  });
  it("rejects invalid numbers and oversized batches", async () => {
    expect(() => toPayslipDocumentModel({ ...payslip, netAmount: NaN })).toThrow();
    await expect(renderPayslipsPdf(Array(101).fill(payslip))).rejects.toThrow("100 fiches");
  });
});
