import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { buildImportSummary } from "@/lib/payroll/import-service";
import { POST } from "@/app/api/imports/route";

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

function createImportRequest(formData: FormData, headers = new Headers()) {
  return {
    headers,
    formData: vi.fn(async () => formData),
  } as unknown as NextRequest;
}

describe("buildImportSummary", () => {
  it("summarizes mixed valid and invalid import results", () => {
    const summary = buildImportSummary({
      validRows: [{ employeeId: "EMP-001" }, { employeeId: "EMP-002" }],
      invalidRows: [{ rowNumber: 4 }],
      unknownEmployeeIds: ["EMP-002"],
    });

    expect(summary).toEqual({
      validRowCount: 2,
      invalidRowCount: 1,
      unknownEmployeeCount: 1,
    });
  });
});

describe("POST /api/imports", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(createSupabaseClientWithUser(null));

    const response = await POST(createImportRequest(new FormData()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 and VALIDATION_ERROR when an authenticated request is missing a file", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const formData = new FormData();
    formData.set("agencyId", "agency-001");
    formData.set("periodStart", "2026-06-01");
    formData.set("periodEnd", "2026-06-30");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 when an authenticated request uploads a file larger than 10 MB", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "payroll.xlsx"));
    formData.set("agencyId", "agency-001");
    formData.set("periodStart", "2026-06-01");
    formData.set("periodEnd", "2026-06-30");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 without parsing form data when content-length exceeds the upload limit and multipart overhead", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const request = createImportRequest(
      new FormData(),
      new Headers({ "content-length": String(10 * 1024 * 1024 + 64 * 1024 + 1) }),
    );

    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("returns 422 when required period fields are blank after trimming", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const formData = new FormData();
    formData.set("file", new File(["employeeId\nEMP-001"], "payroll.xlsx"));
    formData.set("agencyId", "agency-001");
    formData.set("periodStart", "   ");
    formData.set("periodEnd", "2026-06-30");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns uploaded metadata for an authenticated valid request", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const formData = new FormData();
    formData.set("file", new File(["employeeId\nEMP-001"], "payroll.xlsx"));
    formData.set("agencyId", "agency-001");
    formData.set("periodStart", "2026-06-01");
    formData.set("periodEnd", "2026-06-30");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        status: "UPLOADED",
        filename: "payroll.xlsx",
        agencyId: "agency-001",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      },
    });
  });
});
