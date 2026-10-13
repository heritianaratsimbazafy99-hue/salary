import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(), createClient: vi.fn(), recordAuditEvent: vi.fn(),
  isSentryEnabled: vi.fn(), isEnabled: vi.fn(), captureException: vi.fn(), flush: vi.fn(),
  clear: vi.fn(), setTag: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ getCurrentActor: mocks.getCurrentActor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/audit/server", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/sentry-options", () => ({ isSentryEnabled: mocks.isSentryEnabled }));
vi.mock("@sentry/nextjs", () => ({
  isEnabled: mocks.isEnabled, captureException: mocks.captureException, flush: mocks.flush,
  withScope: (callback: (scope: unknown) => void) => callback({ clear: mocks.clear, setTag: mocks.setTag }),
}));

import { runMonitoringSmoke } from "@/lib/monitoring/smoke";
import { sendMonitoringSmoke } from "@/app/hr/operations/actions";

function auditClient(data: unknown[] = [], error: unknown = null) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), gte: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn(() => query), query };
}

describe("monitoring smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentActor.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001", role: "super_admin" });
    mocks.isSentryEnabled.mockReturnValue(true);
    mocks.isEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(auditClient());
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.flush.mockResolvedValue(true);
  });

  it.each(["employee", "agency_manager", "hr_central"])("rejects %s before reading audit or capturing", async (role) => {
    mocks.getCurrentActor.mockResolvedValue({ id: "profile", role });
    await expect(runMonitoringSmoke()).rejects.toThrow("Action non autorisee.");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.getCurrentActor.mockRejectedValue(new Error("Authentification requise."));
    expect(await sendMonitoringSmoke()).toEqual({ error: "Authentification requise." });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("fails closed when Sentry is disabled or the cooldown cannot be read", async () => {
    mocks.isEnabled.mockReturnValue(false);
    await expect(runMonitoringSmoke()).rejects.toThrow("n'est pas configurée");
    mocks.isEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(auditClient([], { message: "database details" }));
    await expect(runMonitoringSmoke()).rejects.toThrow("Impossible de vérifier");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("enforces the persisted fifteen-minute cooldown", async () => {
    const client = auditClient([{ id: "previous" }]);
    mocks.createClient.mockResolvedValue(client);
    await expect(runMonitoringSmoke()).rejects.toThrow("Patientez quinze minutes");
    expect(client.query.eq).toHaveBeenCalledWith("action", "MONITORING_SMOKE_REQUESTED");
    const cutoff = new Date(client.query.gte.mock.calls[0][1] as string).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(Date.now() - cutoff).toBeLessThan(15 * 60 * 1000 + 1000);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("audits a UUID before capturing a fixed error in an isolated scope", async () => {
    const result = await runMonitoringSmoke();
    const event = mocks.recordAuditEvent.mock.calls[0][0];
    expect(event.resourceId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(result).toEqual({ eventId: event.resourceId.replaceAll("-", ""), flushed: true });
    expect(mocks.recordAuditEvent.mock.invocationCallOrder[0]).toBeLessThan(mocks.captureException.mock.invocationCallOrder[0]);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.setTag).toHaveBeenCalledWith("purpose", "launch_smoke");
    expect(mocks.captureException).toHaveBeenCalledWith(new Error("Salary monitoring smoke test"), { event_id: result.eventId });
    expect(mocks.flush).toHaveBeenCalledWith(5000);
  });

  it("does not capture when audit fails, and hides internal errors", async () => {
    mocks.recordAuditEvent.mockRejectedValue(new Error("sensitive internal detail"));
    const result = await sendMonitoringSmoke();
    expect(result.error).toContain("n'a pas pu être confirmé");
    expect(result.error).not.toContain("sensitive");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("does not claim delivery when flush times out", async () => {
    mocks.flush.mockResolvedValue(false);
    expect((await sendMonitoringSmoke()).error).toContain("transmission n'a pas été confirmée");
  });
});
