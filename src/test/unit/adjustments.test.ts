import { describe, expect, it } from "vitest";
import { applyManualAdjustment } from "@/lib/payroll/adjustments";
import type { PayrollRow } from "@/lib/payroll/schema";

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

  it("ignores unknown payroll fields", () => {
    const result = applyManualAdjustment(
      { netAmount: 1000, grossAmount: 1200 },
      { netAmuont: 1100 } as unknown as Partial<PayrollRow>,
    );

    expect(result).toEqual({
      normalizedData: { netAmount: 1000, grossAmount: 1200 },
      manualAdjustments: {},
      hasManualAdjustments: false,
    });
  });

  it("does not let special keys affect adjustment tracking", () => {
    const changes = Object.create(null) as Record<string, unknown>;
    changes.__proto__ = { polluted: true };

    const result = applyManualAdjustment(
      { netAmount: 1000, grossAmount: 1200 },
      changes as Partial<PayrollRow>,
    );

    expect(result).toEqual({
      normalizedData: { netAmount: 1000, grossAmount: 1200 },
      manualAdjustments: {},
      hasManualAdjustments: false,
    });

    const auditPrototype = Object.getPrototypeOf(result.manualAdjustments);

    expect(auditPrototype === null || auditPrototype === Object.prototype).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.normalizedData, "__proto__")).toBe(false);
  });
});
