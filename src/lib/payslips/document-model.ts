import type { EmployeePayslip } from "./employee";

export type PayslipDocumentModel = EmployeePayslip & { companyLabel: string };

export function toPayslipDocumentModel(payslip: EmployeePayslip): PayslipDocumentModel {
  for (const value of [payslip.grossAmount, payslip.deductionsTotal, payslip.netAmount]) {
    if (!Number.isFinite(value)) throw new Error("Montant de fiche invalide.");
  }
  return { ...payslip, payItems: payslip.payItems.map((item) => ({ ...item })), companyLabel: "Fiche de paie interne" };
}
