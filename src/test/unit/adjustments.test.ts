import { describe, expect, it } from "vitest";
import { applyManualAdjustment } from "@/lib/payroll/adjustments";

describe("applyManualAdjustment", () => {
  it("applies a manual adjustment without changing original imported data", () => {
    const result = applyManualAdjustment(
      { netAmount: 1000, grossAmount: 1200 },
      { netAmount: 1100 },
    );

    expect(result).toEqual({
      normalizedData: { netAmount: 1100, grossAmount: 1200 },
      manualAdjustments: { netAmount: { before: 1000, after: 1100 } },
      hasManualAdjustments: true,
    });
  });

  it("does not mutate the original payroll data", () => {
    const original = { netAmount: 1000, grossAmount: 1200 };

    applyManualAdjustment(original, { netAmount: 1100 });

    expect(original).toEqual({ netAmount: 1000, grossAmount: 1200 });
  });

  it("does not record manual adjustments for unchanged values", () => {
    const result = applyManualAdjustment(
      { netAmount: 1000, grossAmount: 1200 },
      { netAmount: 1000 },
    );

    expect(result).toEqual({
      normalizedData: { netAmount: 1000, grossAmount: 1200 },
      manualAdjustments: {},
      hasManualAdjustments: false,
    });
  });
});
