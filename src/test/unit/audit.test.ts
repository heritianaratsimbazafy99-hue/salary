import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit/audit";

describe("sanitizeAuditMetadata", () => {
  it("removes sensitive values from metadata", () => {
    expect(
      sanitizeAuditMetadata({
        token: "secret",
        grossAmount: 1000,
        rowCount: 10,
        filename: "payroll.xlsx",
      }),
    ).toEqual({
      rowCount: 10,
      filename: "payroll.xlsx",
    });
  });
});
