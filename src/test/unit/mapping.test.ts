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

  it("maps numeric strings with whitespace to amounts", () => {
    const result = applyColumnMappings(
      { prime_transport: " 50000 " },
      [{ sourceColumn: "prime_transport", targetCategory: "BENEFIT", displayLabel: "Prime transport" }],
    );

    expect(result).toEqual([
      {
        label: "Prime transport",
        category: "BENEFIT",
        amount: 50000,
        rawValue: " 50000 ",
      },
    ]);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["null", null],
    ["false", false],
  ])("maps %s to text without amount", (_caseName, rawValue) => {
    const result = applyColumnMappings(
      { prime_transport: rawValue },
      [{ sourceColumn: "prime_transport", targetCategory: "BENEFIT", displayLabel: "Prime transport" }],
    );

    expect(result).toEqual([
      {
        label: "Prime transport",
        category: "BENEFIT",
        text: String(rawValue),
        rawValue,
      },
    ]);
    expect(result[0]).not.toHaveProperty("amount");
  });
});
