import { describe, expect, it } from "vitest";

describe("magic-link OTP options", () => {
  it("builds a closed-signup magic-link redirect payload", async () => {
    const { buildMagicLinkOtpOptions } = await import("../../lib/auth/magic-link");

    expect(buildMagicLinkOtpOptions("https://paie.example.com")).toEqual({
      emailRedirectTo: "https://paie.example.com/auth/callback",
      shouldCreateUser: false,
    });
  });
});
