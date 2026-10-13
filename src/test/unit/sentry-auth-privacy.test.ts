import { describe, expect, it } from "vitest";

import { sanitizeSentryAuthLinks, sanitizeSentryErrorEvent } from "@/lib/sentry-options";

describe("authentication telemetry privacy", () => {
  it("removes invitation and callback secrets from errors and navigation breadcrumbs", () => {
    const event = sanitizeSentryErrorEvent({
      type: undefined,
      request: {
        url: "https://pay.example/auth/invitation?token=invitation-secret",
        headers: { referer: "https://pay.example/auth/callback?token_hash=auth-secret" },
        data: { token: "form-secret" },
      },
      breadcrumbs: [{ category: "navigation", data: {
        from: "/auth/invitation?token=invitation-secret",
        to: "/auth/callback?token_hash=auth-secret",
      } }],
    });
    expect(JSON.stringify(event)).not.toMatch(/invitation-secret|auth-secret|form-secret/);
    expect(event.breadcrumbs?.[0].data?.to).toBe("/auth/callback?token_hash=[Filtered]");
  });

  it("scrubs transactions and standalone spans without removing operational context", () => {
    const event = sanitizeSentryAuthLinks({
      transaction: "POST /auth/invitation?token=secret-one",
      spans: [{ description: "GET /auth/callback?code=secret-two", data: {
        "http.url": "https://pay.example/auth/callback?token_hash=secret-three&next=home",
        "http.query": "token=secret-four&other=value",
        token_hash: "secret-five",
        "http.response.status_code": 200,
      } }],
    });
    expect(JSON.stringify(event)).not.toContain("secret-");
    expect(event.spans[0].data["http.response.status_code"]).toBe(200);
    expect(event.spans[0].data["http.query"]).toBe("token=[Filtered]&other=value");
  });
});
