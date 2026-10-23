import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveServerEnv } from "@/lib/env.server";
import { SUPPORT_EMAIL } from "@/lib/support";

describe("email reply configuration", () => {
  it.each([undefined, "", "   "])("defaults to the existing public support contact when unset (%j)", (value) => {
    expect(resolveServerEnv({ RESEND_REPLY_TO_EMAIL: value }).RESEND_REPLY_TO_EMAIL).toBe(SUPPORT_EMAIL);
  });

  it("accepts and trims a configured monitored reply mailbox", () => {
    expect(resolveServerEnv({ RESEND_REPLY_TO_EMAIL: " support@example.com " }).RESEND_REPLY_TO_EMAIL).toBe("support@example.com");
  });

  it.each(["not-an-address", "support@example.com,other@example.com", "support@example.com\r\nBcc: other@example.com"])("rejects an invalid reply address (%j)", (value) => {
    expect(() => resolveServerEnv({ RESEND_REPLY_TO_EMAIL: value })).toThrow();
  });
});
