import { describe, expect, it } from "vitest";
import { parsePayrollRowsFromObjects } from "@/lib/payroll/parser";

const validPayrollRow = {
  employee_id: "EMP-001",
  email: "employee@example.com",
  period_start: "2026-06-01",
  period_end: "2026-06-30",
  employee_name: "Employee One",
  gross_amount: 1200000,
  deductions_total: 100000,
  net_amount: 1100000,
};

describe("parsePayrollRowsFromObjects", () => {
  it("parses valid rows and reports unknown columns", () => {
    const result = parsePayrollRowsFromObjects([
      {
        ...validPayrollRow,
        prime_transport: 50000,
      },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.unknownColumns).toEqual(["prime_transport"]);
  });

  it("normalizes employee ids to uppercase", () => {
    const result = parsePayrollRowsFromObjects([{ ...validPayrollRow, employee_id: " emp-001 " }]);

    expect(result.validRows[0]?.data.employeeId).toBe("EMP-001");
  });

  it("imports valid rows and records invalid row errors", () => {
    const result = parsePayrollRowsFromObjects([
      validPayrollRow,
      {
        employee_id: "",
        email: "not-an-email",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        employee_name: "",
        gross_amount: "bad",
        deductions_total: 100000,
        net_amount: 1100000,
      },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]?.errors.map((error) => error.fieldName)).toContain("email");
  });

  it.each(["", "   "])("rejects blank required gross amount value %#", (grossAmount) => {
    const result = parsePayrollRowsFromObjects([{ ...validPayrollRow, gross_amount: grossAmount }]);

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]?.errors.map((error) => error.fieldName)).toContain("grossAmount");
  });

  it("reports the source raw value for normalized field errors", () => {
    const result = parsePayrollRowsFromObjects([{ ...validPayrollRow, gross_amount: "bad" }]);

    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]?.errors).toContainEqual(
      expect.objectContaining({
        fieldName: "grossAmount",
        rawValue: "bad",
      }),
    );
  });
});
