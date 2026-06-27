import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";

const { validateProductionEnv } = await import(
  pathToFileURL(`${process.cwd()}/scripts/verify-prod-env.mjs`).href
);

const validEnv = {
  NEXT_PUBLIC_APP_URL: "https://salary.example.com",
  NEXT_PUBLIC_SENTRY_DSN: "https://examplePublicKey@o4511531370676224.ingest.de.sentry.io/4511638042902608",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.1",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SENTRY_AUTH_TOKEN: "sntrys_placeholder_token_for_tests_only",
  SENTRY_ORG: "stark-3t",
  SENTRY_PROJECT: "salary",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-role",
};

describe("production environment validation", () => {
  it("accepts the complete production environment outside Resend", () => {
    expect(validateProductionEnv(validEnv)).toEqual({
      errors: [],
      ok: true,
    });
  });

  it("requires Sentry monitoring variables for production", () => {
    const result = validateProductionEnv({
      ...validEnv,
      NEXT_PUBLIC_SENTRY_DSN: "",
      SENTRY_AUTH_TOKEN: "",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("NEXT_PUBLIC_SENTRY_DSN is required.");
    expect(result.errors).toContain("SENTRY_AUTH_TOKEN is required.");
  });

  it("rejects invalid Sentry sample rates", () => {
    const result = validateProductionEnv({
      ...validEnv,
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "1.5",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.");
  });

  it("rejects placeholder Sentry auth tokens", () => {
    const result = validateProductionEnv({
      ...validEnv,
      SENTRY_AUTH_TOKEN: "placeholder-sentry-token",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SENTRY_AUTH_TOKEN must be a Sentry organization auth token and must stay server/build-only.");
  });
});
