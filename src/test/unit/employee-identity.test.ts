import { describe, expect, it } from "vitest";
import { canonicalEmployeeId, EmployeeIdSchema } from "@/lib/employees/identity";
import { parsePayrollRowsFromObjects } from "@/lib/payroll/parser";
import { validateEmployeeIdentities } from "@/lib/payroll/import-service";

const raw = { employee_id: " ab-001 ", email: "worker@example.test", employee_name: "Worker", period_start: "2026-10-01", period_end: "2026-10-31", gross_amount: 100, deductions_total: 10, net_amount: 90 };

describe("shared employee identity contract", () => {
  it.each([[" Ab-001 ", "AB-001"], ["\u00a0équipe-ß\ufeff", "éQUIPE-ß"], ["a b", "A B"], ["a\u200bb", "A\u200bB"]])("canonicalizes %j without Unicode expansion", (value, expected) => {
    expect(EmployeeIdSchema.parse(value)).toBe(expected);
    expect(canonicalEmployeeId(expected)).toBe(expected);
    expect(parsePayrollRowsFromObjects([{ ...raw, employee_id: value }]).validRows[0].data.employeeId).toBe(expected);
  });
  it("rejects blank and overlong identities and counts Unicode code points", () => {
    expect(EmployeeIdSchema.safeParse(" \t ").success).toBe(false);
    expect(EmployeeIdSchema.safeParse("a".repeat(81)).success).toBe(false);
    expect(EmployeeIdSchema.safeParse("😀".repeat(80)).success).toBe(true);
  });
  it("recognizes the existing canonical dossier and reports conflicts on their source line", () => {
    const rows = parsePayrollRowsFromObjects([raw]).validRows;
    const existing = { employee_id: "AB-001", email: raw.email, is_active: true };
    expect(validateEmployeeIdentities(rows, [existing]).validRows).toHaveLength(1);
    for (const employee of [
      { ...existing, email: "changed@example.test" },
      { ...existing, employee_id: "OTHER" },
      { ...existing, is_active: false },
    ]) {
      const result = validateEmployeeIdentities(rows, [employee]);
      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows[0]).toMatchObject({ rowNumber: 2, errors: [{ errorCode: "IDENTITY_CONFLICT" }] });
    }
  });
  it("rejects every duplicate canonical matricule or email before persistence", () => {
    for (const second of [{ ...raw, employee_id: "AB-001", email: "other@example.test" }, { ...raw, employee_id: "OTHER" }]) {
      const result = validateEmployeeIdentities(parsePayrollRowsFromObjects([raw, second]).validRows, []);
      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows.map((row) => row.rowNumber)).toEqual([2, 3]);
    }
  });
});
