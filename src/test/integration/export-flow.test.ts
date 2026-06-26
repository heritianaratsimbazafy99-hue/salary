import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/exports/route";
import { canCreateExport } from "@/lib/payroll/export";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

function createSupabaseClientWithUser(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
  };
}

function createExportRequest(body: unknown) {
  return {
    json: vi.fn(async () => body),
  } as unknown as NextRequest;
}

function createMalformedJsonRequest() {
  return {
    json: vi.fn(async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    }),
  } as unknown as NextRequest;
}

describe("canCreateExport", () => {
  it("allows agency manager import report exports for own agency", () => {
    expect(
      canCreateExport({
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      }),
    ).toBe(true);
  });

  it("denies agency manager published payslip exports", () => {
    expect(
      canCreateExport({
        role: "agency_manager",
        exportType: "PUBLISHED_PAYSLIPS",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      }),
    ).toBe(false);
  });
});

describe("POST /api/exports", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(createSupabaseClientWithUser(null));

    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 and VALIDATION_ERROR for invalid export types", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createExportRequest({ exportType: "PAYROLL_ROWS" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 and VALIDATION_ERROR for malformed JSON", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createMalformedJsonRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns pending export metadata for authenticated valid requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: "PENDING", exportType: "PUBLISHED_PAYSLIPS" },
    });
  });
});
