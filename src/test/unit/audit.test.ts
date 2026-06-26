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

  it("drops sensitive key variants that are not explicitly allowlisted", () => {
    expect(
      sanitizeAuditMetadata({
        Token: "secret",
        gross_amount: 1000,
        net_amount: 800,
        snapshot_data: { rows: [] },
        raw_excel: "base64",
        password: "password",
        secret: "secret",
        apiKey: "key",
        rowCount: 10,
        filename: "payroll.xlsx",
      }),
    ).toEqual({
      rowCount: 10,
      filename: "payroll.xlsx",
    });
  });

  it("recursively sanitizes plain objects and arrays under allowlisted keys", () => {
    expect(
      sanitizeAuditMetadata({
        resourceId: "resource-1",
        status: {
          rowCount: 3,
          filename: "nested.xlsx",
          token: "secret",
          details: {
            rowCount: 99,
          },
        },
        importId: [
          {
            filename: "batch.xlsx",
            rawExcel: "base64",
          },
          "import-2",
        ],
        token: "root-secret",
      }),
    ).toEqual({
      resourceId: "resource-1",
      status: {
        rowCount: 3,
        filename: "nested.xlsx",
      },
      importId: [
        {
          filename: "batch.xlsx",
        },
        "import-2",
      ],
    });
  });

  it("does not mutate input metadata", () => {
    const metadata = {
      filename: "payroll.xlsx",
      status: {
        rowCount: 3,
        token: "secret",
      },
      token: "root-secret",
    };
    const original = structuredClone(metadata);

    const sanitized = sanitizeAuditMetadata(metadata);

    expect(sanitized).toEqual({
      filename: "payroll.xlsx",
      status: {
        rowCount: 3,
      },
    });
    expect(metadata).toEqual(original);
    expect(sanitized).not.toBe(metadata);
    expect(sanitized.status).not.toBe(metadata.status);
  });
});
