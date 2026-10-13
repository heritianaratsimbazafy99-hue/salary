import { beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send };
  },
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: { RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "payroll@example.com" },
}));
vi.mock("@/lib/env.public", () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: "https://salary.example.com" },
}));

import { sendEmployeeActivationEmail, sendPayslipPublishedEmail } from "@/lib/notifications/resend-server";

describe("sendPayslipPublishedEmail", () => {
  beforeEach(() => { resendMocks.send.mockReset(); });

  it("delivers the generated activation URL through the provider", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
    await expect(sendPayslipPublishedEmail({
      to: "worker@example.com", employeeName: "Worker One", invitationToken: "personal-token",
    })).resolves.toEqual({ data: { id: "provider-id" }, error: null });
    expect(resendMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "worker@example.com",
      html: expect.stringContaining("https://salary.example.com/auth/invitation?token=personal-token"),
    }));
  });

  it("rejects structured provider errors without exposing its request details", async () => {
    resendMocks.send.mockResolvedValue({ data: null, error: { message: "Rejected personal-token" } });
    await expect(sendPayslipPublishedEmail({
      to: "worker@example.com", employeeName: "Worker One", invitationToken: "personal-token",
    })).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
  });
});

describe("sendEmployeeActivationEmail", () => {
  beforeEach(() => { resendMocks.send.mockReset(); });

  it("delivers the supplied confirmation link without payroll information", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "activation-id" }, error: null });
    await expect(sendEmployeeActivationEmail({
      to: "worker@example.com",
      confirmationUrl: "https://salary.example.com/auth/callback?token_hash=verification-token&type=email",
    })).resolves.toEqual({ data: { id: "activation-id" }, error: null });
    expect(resendMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "worker@example.com",
      subject: "Confirmez votre accès à MadajobPay",
      html: expect.stringContaining('href="https://salary.example.com/auth/callback?token_hash=verification-token&amp;type=email"'),
    }));
    expect(resendMocks.send.mock.calls[0][0].html).toContain("Confirmer mon accès");
    expect(resendMocks.send.mock.calls[0][0].html).not.toMatch(/MGA|montant|salaire/);
  });

  it.each([false, true])("sanitizes provider failure details (exception: %s)", async (exception) => {
    if (exception) resendMocks.send.mockRejectedValue(new Error("Leaked verification-token"));
    else resendMocks.send.mockResolvedValue({ data: null, error: { message: "Leaked verification-token" } });
    await expect(sendEmployeeActivationEmail({
      to: "worker@example.com",
      confirmationUrl: "https://salary.example.com/auth/callback?token_hash=verification-token",
    })).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
  });

  it.each([
    "javascript:alert(1)",
    "http://salary.example.com/auth/callback?token_hash=secret",
    "https://salary.example.com/other?token_hash=secret",
    "https://salary.example.com/auth/callback",
  ])("rejects an invalid confirmation URL: %s", async (confirmationUrl) => {
    await expect(sendEmployeeActivationEmail({ to: "worker@example.com", confirmationUrl }))
      .rejects.toThrow("Lien de confirmation invalide.");
    expect(resendMocks.send).not.toHaveBeenCalled();
  });
});
