import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

const adminMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

const validResendApiKey = ["re", "placeholder_key_for_tests_only_123456"].join("_");

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: adminMocks.createAdminClient,
}));

function createHealthClient(error: Error | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ error })),
    })),
  };
}

function stubResendEnv() {
  vi.stubEnv("RESEND_API_KEY", validResendApiKey);
  vi.stubEnv("RESEND_FROM_EMAIL", "MadajobPay <no-reply@salary.example.com>");
}

describe("GET /api/health", () => {
  beforeEach(() => {
    adminMocks.createAdminClient.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns ok when Supabase and Resend are configured", async () => {
    stubResendEnv();
    adminMocks.createAdminClient.mockReturnValue(createHealthClient());

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: {
        app: "ok",
        email: "configured",
        supabase: "ok",
      },
      status: "ok",
    });
  });

  it("returns degraded when Resend is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    adminMocks.createAdminClient.mockReturnValue(createHealthClient());

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      checks: {
        app: "ok",
        email: "missing",
        supabase: "ok",
      },
      status: "degraded",
    });
  });

  it("returns degraded when Supabase is unavailable", async () => {
    stubResendEnv();
    adminMocks.createAdminClient.mockReturnValue(createHealthClient(new Error("unavailable")));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      checks: {
        app: "ok",
        email: "configured",
        supabase: "error",
      },
      status: "degraded",
    });
  });
});
