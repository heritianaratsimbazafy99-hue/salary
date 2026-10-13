import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ send: vi.fn(), batch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({ Resend: class { emails = { send: provider.send }; batch = { send: provider.batch }; } }));
vi.mock("@/lib/env.server", () => ({ serverEnv: { RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "payroll@example.com" } }));
vi.mock("@/lib/env.public", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "https://salary.example.com" } }));

import * as mailer from "@/lib/notifications/resend-server";

const worker = (index: number) => ({ to: `worker${index}@example.com`, employeeName: `Worker ${index}`, invitationToken: `private-token-${index}` });
const accepted = { data: { id: "provider-id" }, error: null, headers: {} };

describe("email capacity and delivery recovery", () => {
  beforeEach(() => { provider.send.mockReset(); provider.batch.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("recovers a provider rate limit using the same idempotency key and Retry-After", async () => {
    provider.send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "private-token" }, headers: { "retry-after": "2" } }).mockResolvedValueOnce(accepted);
    const result = mailer.sendPayslipPublishedEmail(worker(1));
    const assertion = expect(result).resolves.toEqual(accepted);
    await vi.advanceTimersByTimeAsync(1999);
    expect(provider.send).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await assertion;
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send.mock.calls[0][1].idempotencyKey).toBe(provider.send.mock.calls[1][1].idempotencyKey);
    expect(provider.send.mock.calls[0][1].idempotencyKey).not.toContain("private-token");
  });

  it.each(["daily_quota_exceeded", "monthly_quota_exceeded"])("does not retry exhausted %s quotas", async (name) => {
    provider.send.mockResolvedValue({ data: null, error: { name, statusCode: 429, message: "private-token" } });
    const assertion = expect(mailer.sendPayslipPublishedEmail(worker(1))).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
    await vi.runAllTimersAsync();
    await assertion;
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("bounds attempts and sanitizes repeated network failures", async () => {
    provider.send.mockRejectedValue(new Error("private-token"));
    const assertion = expect(mailer.sendPayslipPublishedEmail(worker(1))).rejects.toThrow("Le fournisseur email a refusé l'envoi.");
    await vi.runAllTimersAsync();
    await assertion;
    expect(provider.send).toHaveBeenCalledTimes(3);
    expect(new Set(provider.send.mock.calls.map((call) => call[1].idempotencyKey)).size).toBe(1);
  });

  it("sends 340 private invitations in four batches with exact recipient/provider ID mapping", async () => {
    let sent = 0;
    provider.batch.mockImplementation(async (messages) => ({ data: { data: messages.map(() => ({ id: `mail-${sent++}` })) }, error: null }));
    const results = await mailer.sendPayslipPublishedEmails(Array.from({ length: 340 }, (_, index) => worker(index)));
    expect(provider.batch.mock.calls.map((call) => call[0].length)).toEqual([100, 100, 100, 40]);
    expect(provider.send).not.toHaveBeenCalled();
    expect(results).toHaveLength(340);
    results.forEach((result, index) => expect(result).toMatchObject({ data: { id: `mail-${index}` }, error: null }));
    const messages = provider.batch.mock.calls.flatMap((call) => call[0]);
    messages.forEach((message, index) => {
      expect(message.to).toBe(`worker${index}@example.com`);
      expect(message.html).toContain(`token=private-token-${index}\"`);
      expect(message.cc).toBeUndefined(); expect(message.bcc).toBeUndefined();
    });
    expect(new Set(provider.batch.mock.calls.map((call) => call[1].idempotencyKey)).size).toBe(4);
  });

  it("stops subsequent batches on quota exhaustion and reports every unsent recipient", async () => {
    provider.batch.mockResolvedValueOnce({ data: { data: Array.from({ length: 100 }, (_, index) => ({ id: `mail-${index}` })) }, error: null })
      .mockResolvedValueOnce({ data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "private-token" } });
    const results = await mailer.sendPayslipPublishedEmails(Array.from({ length: 340 }, (_, index) => worker(index)));
    expect(provider.batch).toHaveBeenCalledTimes(2);
    expect(results.filter((result) => !result.error)).toHaveLength(100);
    expect(results.filter((result) => result.error)).toHaveLength(240);
    expect(JSON.stringify(results)).not.toContain("private-token");
  });

  it("never associates provider IDs from a malformed partial batch response", async () => {
    provider.batch.mockResolvedValue({ data: { data: [{ id: "only-one-id" }] }, error: null });
    const results = await mailer.sendPayslipPublishedEmails([worker(1), worker(2)]);
    expect(results.every((result) => result.error && !result.data)).toBe(true);
  });
  it("keeps two publication events distinct even when rendered emails are identical", async () => {
    provider.batch.mockResolvedValue({ data: { data: [{ id: "mail" }] }, error: null });
    await mailer.sendPayslipPublishedEmails([{ ...worker(1), idempotencyKey: "notification/october" }]);
    await mailer.sendPayslipPublishedEmails([{ ...worker(1), idempotencyKey: "notification/november" }]);
    await mailer.sendPayslipPublishedEmails([{ ...worker(1), idempotencyKey: "notification/november" }]);
    expect(provider.batch.mock.calls[0][1].idempotencyKey).not.toBe(provider.batch.mock.calls[1][1].idempotencyKey);
    expect(provider.batch.mock.calls[1][1].idempotencyKey).toBe(provider.batch.mock.calls[2][1].idempotencyKey);
  });

});
