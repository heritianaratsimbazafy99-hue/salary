import { describe, expect, it } from "vitest";

describe("role guards", () => {
  it("allows only central HR and super admins to read every agency", async () => {
    const { canReadAllAgencies } = await import("../../lib/roles");

    expect(canReadAllAgencies("hr_central")).toBe(true);
    expect(canReadAllAgencies("super_admin")).toBe(true);
    expect(canReadAllAgencies("agency_manager")).toBe(false);
    expect(canReadAllAgencies("employee")).toBe(false);
  });

  it("allows only agency managers to publish for an agency", async () => {
    const { canPublishForAgency } = await import("../../lib/roles");

    expect(canPublishForAgency("agency_manager")).toBe(true);
    expect(canPublishForAgency("hr_central")).toBe(false);
    expect(canPublishForAgency("employee")).toBe(false);
    expect(canPublishForAgency("super_admin")).toBe(false);
  });
});

describe("Supabase public env resolver", () => {
  it("prefers the current publishable key over the legacy anon key", async () => {
    const { resolvePublicSupabaseConfig } = await import("../../lib/env.public");

    expect(
      resolvePublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_current",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy_anon_key",
        NEXT_PUBLIC_APP_URL: "https://paie.example.com",
      }),
    ).toEqual({
      appUrl: "https://paie.example.com",
      supabasePublishableKey: "sb_publishable_current",
      supabaseUrl: "https://example.supabase.co",
    });
  });

  it("falls back to the legacy anon key when the publishable key is not set", async () => {
    const { resolvePublicSupabaseConfig } = await import("../../lib/env.public");

    expect(
      resolvePublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy_anon_key",
      }),
    ).toEqual({
      appUrl: "http://localhost:3000",
      supabasePublishableKey: "legacy_anon_key",
      supabaseUrl: "https://example.supabase.co",
    });
  });

  it("throws a clear invocation-time error when Supabase public config is missing", async () => {
    const { resolvePublicSupabaseConfig } = await import("../../lib/env.public");

    expect(() => resolvePublicSupabaseConfig({})).toThrow(
      "Supabase public configuration is missing or invalid",
    );
  });
});
