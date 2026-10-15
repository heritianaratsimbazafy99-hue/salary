import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send };
  },
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: { RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "payroll@example.com", RESEND_REPLY_TO_EMAIL: "support@example.com" },
}));
vi.mock("@/lib/env.public", () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: "https://salary.example.com" },
}));

import { sendEmployeeActivationEmail, sendPayslipPublishedEmail, sendHrNotificationEmail } from "@/lib/notifications/resend-server";

describe("sendPayslipPublishedEmail", () => {
  beforeEach(() => { resendMocks.send.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("delivers the generated activation URL through the provider", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
    await expect(sendPayslipPublishedEmail({
      to: "worker@example.com", employeeName: "Worker One", invitationToken: "personal-token",
    })).resolves.toEqual({ data: { id: "provider-id" }, error: null });
    expect(resendMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "worker@example.com",
      from: "payroll@example.com",
      replyTo: "support@example.com",
      html: expect.stringContaining("https://salary.example.com/auth/invitation?token=personal-token"),
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
  });

  it("rejects structured provider errors without exposing its request details", async () => {
    resendMocks.send.mockResolvedValue({ data: null, error: { message: "Rejected personal-token" } });
    await expect(sendPayslipPublishedEmail({
      to: "worker@example.com", employeeName: "Worker One", invitationToken: "personal-token",
    })).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
  });
});

describe("sendEmployeeActivationEmail", () => {
  beforeEach(() => { resendMocks.send.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("delivers the supplied confirmation link without payroll information", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "activation-id" }, error: null });
    await expect(sendEmployeeActivationEmail({
      to: "worker@example.com",
      confirmationUrl: "https://salary.example.com/auth/callback?token_hash=verification-token&type=email",
    })).resolves.toEqual({ data: { id: "activation-id" }, error: null });
    expect(resendMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "worker@example.com",
      from: "payroll@example.com",
      replyTo: "support@example.com",
      subject: "Confirmez votre accès à MadajobPay",
      html: expect.stringContaining('href="https://salary.example.com/auth/callback?token_hash=verification-token&amp;type=email"'),
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(resendMocks.send.mock.calls[0][0].html).toContain("Confirmer mon accès");
    expect(resendMocks.send.mock.calls[0][0].html).not.toMatch(/MGA|montant|salaire/);
  });

  it.each([false, true])("sanitizes provider failure details (exception: %s)", async (exception) => {
    if (exception) resendMocks.send.mockRejectedValue(new Error("Leaked verification-token"));
    else resendMocks.send.mockResolvedValue({ data: null, error: { message: "Leaked verification-token" } });
    const assertion = expect(sendEmployeeActivationEmail({
      to: "worker@example.com",
      confirmationUrl: "https://salary.example.com/auth/callback?token_hash=verification-token",
    })).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
    await vi.runAllTimersAsync();
    await assertion;
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


describe("notification reply addresses", () => {
  beforeEach(() => { resendMocks.send.mockReset(); });

  it("uses the configured reply address for payroll without an invitation", async () => {
    resendMocks.send.mockResolvedValue({ data: { id: "payroll-id" }, error: null });
    await sendPayslipPublishedEmail({ to: "worker@example.com", employeeName: "Worker" });
    expect(resendMocks.send.mock.calls[0][0]).toMatchObject({
      from: "payroll@example.com", to: "worker@example.com", replyTo: "support@example.com",
      subject: "Nouvelle fiche de paie disponible",
    });
  });

  it.each([false, true])("uses the configured reply address for HR mail (attachment: %s)", async (attachment) => {
    resendMocks.send.mockResolvedValue({ data: { id: "hr-id" }, error: null });
    await sendHrNotificationEmail({
      to: "hr@example.com", subject: "Rapport RH", html: "<p>Rapport</p>", idempotencyKey: "hr/report/month",
      ...(attachment ? { attachments: [{ filename: "report.csv", content: "Site,Effectif\nNord,1" }] } : {}),
    });
    expect(resendMocks.send.mock.calls[0][0]).toMatchObject({
      from: "payroll@example.com", to: "hr@example.com", replyTo: "support@example.com", subject: "Rapport RH", html: "<p>Rapport</p>",
    });
    expect(resendMocks.send.mock.calls[0][0].attachments?.length ?? 0).toBe(attachment ? 1 : 0);
  });
});
