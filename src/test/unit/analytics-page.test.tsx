import { beforeEach, describe, expect, it, vi } from "vitest";

const analyticsPageMocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
  requireCanReadPayrollAnalytics: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireCanReadPayrollAnalytics: analyticsPageMocks.requireCanReadPayrollAnalytics,
}));

vi.mock("@/lib/audit/server", () => ({
  recordAuditEvent: analyticsPageMocks.recordAuditEvent,
}));

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.resetModules();
    analyticsPageMocks.recordAuditEvent.mockReset();
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockReset();
  });

  it("does not render or audit when payroll analytics access is forbidden", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Action non autorisee."),
    );

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    await expect(AnalyticsPage()).rejects.toThrow("Action non autorisee.");
    expect(analyticsPageMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("audits successful payroll analytics page access before rendering", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000101",
      role: "hr_central",
    });
    analyticsPageMocks.recordAuditEvent.mockResolvedValue(undefined);

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    await expect(AnalyticsPage()).resolves.toBeTruthy();
    expect(analyticsPageMocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "ANALYTICS_VIEWED",
      actorProfileId: "00000000-0000-0000-0000-000000000101",
      actorRole: "hr_central",
      resourceType: "payroll_analytics",
    });
  });
});
