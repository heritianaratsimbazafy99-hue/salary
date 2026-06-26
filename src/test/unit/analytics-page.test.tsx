import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyticsPageMocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
  redirect: vi.fn(),
  requireCanReadPayrollAnalytics: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: analyticsPageMocks.redirect,
}));

vi.mock("@/lib/admin/auth", () => ({
  requireCanReadPayrollAnalytics: analyticsPageMocks.requireCanReadPayrollAnalytics,
}));

vi.mock("@/lib/audit/server", () => ({
  recordAuditEvent: analyticsPageMocks.recordAuditEvent,
}));

describe("AnalyticsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    analyticsPageMocks.recordAuditEvent.mockReset();
    analyticsPageMocks.redirect.mockReset();
    analyticsPageMocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockReset();
  });

  it("redirects unauthenticated users to login without auditing", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Authentification requise."),
    );

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    await expect(AnalyticsPage()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
    expect(analyticsPageMocks.redirect).toHaveBeenCalledWith("/auth/login");
    expect(analyticsPageMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("renders a clean forbidden state without auditing unauthorized roles", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Action non autorisee."),
    );

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    render(await AnalyticsPage());

    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(screen.getByText("Votre role ne permet pas d'ouvrir cette page.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Analytics paie" })).toBeNull();
    expect(screen.queryByText("Acces reserve RH centrale et super admin")).toBeNull();
    expect(screen.queryByText("Brut total")).toBeNull();
    expect(analyticsPageMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("does not convert configuration failures into auth redirects", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Supabase public configuration is missing or invalid."),
    );

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    await expect(AnalyticsPage()).rejects.toThrow("Supabase public configuration is missing");
    expect(analyticsPageMocks.redirect).not.toHaveBeenCalled();
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
