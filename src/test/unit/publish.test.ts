import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/imports/[importId]/publish/route";
import { nextVersionNumber } from "@/lib/payroll/publish";

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

function createPublishRequest() {
  return {} as NextRequest;
}

function createPublishContext(importId: string) {
  return {
    params: Promise.resolve({ importId }),
  };
}

describe("nextVersionNumber", () => {
  it("starts at version one", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("increments from highest existing version", () => {
    expect(nextVersionNumber([1, 3, 2])).toBe(4);
  });
});

describe("POST /api/imports/:importId/publish", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(createSupabaseClientWithUser(null));

    const response = await POST(createPublishRequest(), createPublishContext("import-001"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 and VALIDATION_ERROR when the import id is blank", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createPublishRequest(), createPublishContext(""));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 and VALIDATION_ERROR when the import id is whitespace only", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createPublishRequest(), createPublishContext("   "));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns published metadata with a normalized import id for an authenticated valid request", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await POST(createPublishRequest(), createPublishContext("  import-001  "));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { importId: "import-001", status: "PUBLISHED" },
    });
  });
});
