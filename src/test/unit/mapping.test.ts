import { describe, expect, it } from "vitest";
import { applyColumnMappings } from "@/lib/payroll/mapping";

describe("applyColumnMappings", () => {
  it("maps unknown columns to configured pay item categories", () => {
    const result = applyColumnMappings(
      { prime_transport: 50000 },
      [{ sourceColumn: "prime_transport", targetCategory: "BENEFIT", displayLabel: "Prime transport" }],
    );

    expect(result).toEqual([
      {
        label: "Prime transport",
        category: "BENEFIT",
        amount: 50000,
        rawValue: 50000,
      },
    ]);
  });
});
