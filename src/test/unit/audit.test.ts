import { beforeEach, describe, expect, it, vi } from "vitest";

import { sanitizeAuditMetadata } from "@/lib/audit/audit";

const auditMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: auditMocks.createAdminClient,
}));

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

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    auditMocks.createAdminClient.mockReset();
  });

  it("inserts a sanitized audit log with the service-role client", async () => {
    const insertedPayloads: Array<Record<string, unknown>> = [];
    const insert = vi.fn(async (payload: Record<string, unknown>) => {
      insertedPayloads.push(payload);

      return { error: null };
    });
    const from = vi.fn((table: string) => {
      expect(table).toBe("audit_logs");

      return { insert };
    });
    auditMocks.createAdminClient.mockReturnValue({ from });

    const { recordAuditEvent } = await import("@/lib/audit/server");

    await recordAuditEvent({
      action: "ANALYTICS_VIEWED",
      actorProfileId: "00000000-0000-0000-0000-000000000101",
      actorRole: "hr_central",
      metadata: {
        grossAmount: 123456,
        rowCount: 2,
        status: {
          netAmount: 100000,
          rowCount: 1,
        },
        token: "secret",
      },
      resourceType: "payroll_analytics",
    });

    expect(auditMocks.createAdminClient).toHaveBeenCalledOnce();
    expect(insertedPayloads).toEqual([
      {
        action: "ANALYTICS_VIEWED",
        actor_profile_id: "00000000-0000-0000-0000-000000000101",
        actor_role: "hr_central",
        agency_id: null,
        employee_id: null,
        ip_address: null,
        metadata: {
          rowCount: 2,
          status: {
            rowCount: 1,
          },
        },
        resource_id: null,
        resource_type: "payroll_analytics",
        user_agent: null,
      },
    ]);
  });

  it("fails closed when the audit insert fails", async () => {
    const insert = vi.fn(async () => ({ error: { message: "database unavailable" } }));
    auditMocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });

    const { recordAuditEvent } = await import("@/lib/audit/server");

    await expect(
      recordAuditEvent({
        action: "ANALYTICS_VIEWED",
        actorRole: "super_admin",
        resourceType: "payroll_analytics",
      }),
    ).rejects.toThrow("Impossible d'enregistrer l'audit.");
  });
});
