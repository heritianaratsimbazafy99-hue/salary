import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginPageSource = readFileSync("src/app/auth/login/page.tsx", "utf8");
const magicLinkHashHandlerPath = "src/components/auth/MagicLinkHashHandler.tsx";
const magicLinkHashHandlerSource = existsSync(magicLinkHashHandlerPath)
  ? readFileSync(magicLinkHashHandlerPath, "utf8")
  : "";

describe("magic-link OTP options", () => {
  it("builds a closed-signup magic-link redirect payload", async () => {
    const { buildMagicLinkOtpOptions } = await import("../../lib/auth/magic-link");

    expect(buildMagicLinkOtpOptions("https://paie.example.com")).toEqual({
      emailRedirectTo: "https://paie.example.com/auth/callback",
      shouldCreateUser: false,
    });
  });

  it("does not establish a session from URL fragment tokens on the login page", () => {
    expect(loginPageSource).not.toContain("<MagicLinkHashHandler />");
    expect(magicLinkHashHandlerSource).not.toContain("setSession");
  });
});
