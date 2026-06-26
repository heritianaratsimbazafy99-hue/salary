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
  const cases = [
    {
      name: "allows hr central import report exports",
      input: { role: "hr_central", exportType: "IMPORT_REPORT" },
      expected: true,
    },
    {
      name: "allows hr central published payslip exports",
      input: { role: "hr_central", exportType: "PUBLISHED_PAYSLIPS" },
      expected: true,
    },
    {
      name: "allows super admin import report exports",
      input: { role: "super_admin", exportType: "IMPORT_REPORT" },
      expected: true,
    },
    {
      name: "allows super admin published payslip exports",
      input: { role: "super_admin", exportType: "PUBLISHED_PAYSLIPS" },
      expected: true,
    },
    {
      name: "allows agency manager import report exports for own agency",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      },
      expected: true,
    },
    {
      name: "denies agency manager published payslip exports for own agency",
      input: {
        role: "agency_manager",
        exportType: "PUBLISHED_PAYSLIPS",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager cross-agency import report exports",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-2",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when actor agency is missing",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when actor agency is null",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: null,
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when agency ids are empty",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "",
        requestedAgencyId: "",
      },
      expected: false,
    },
    {
      name: "denies employee import report exports",
      input: { role: "employee", exportType: "IMPORT_REPORT" },
      expected: false,
    },
    {
      name: "denies employee published payslip exports",
      input: { role: "employee", exportType: "PUBLISHED_PAYSLIPS" },
      expected: false,
    },
  ] as const;

  it.each(cases)("$name", ({ input, expected }) => {
    expect(canCreateExport(input)).toBe(expected);
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
