import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyticsPageMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  recordAuditEvent: vi.fn(),
  redirect: vi.fn(),
  requireCanReadPayrollAnalytics: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: analyticsPageMocks.redirect,
  usePathname: () => "/hr/analytics",
}));

vi.mock("@/lib/admin/auth", () => ({
  requireCanReadPayrollAnalytics: analyticsPageMocks.requireCanReadPayrollAnalytics,
}));

vi.mock("@/lib/audit/server", () => ({
  recordAuditEvent: analyticsPageMocks.recordAuditEvent,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: analyticsPageMocks.createClient,
}));

describe("AnalyticsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    analyticsPageMocks.createClient.mockReset();
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
    expect(analyticsPageMocks.createClient).not.toHaveBeenCalled();
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
    expect(analyticsPageMocks.createClient).not.toHaveBeenCalled();
    expect(analyticsPageMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("does not convert configuration failures into auth redirects", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Supabase public configuration is missing or invalid."),
    );

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    await expect(AnalyticsPage()).rejects.toThrow("Supabase public configuration is missing");
    expect(analyticsPageMocks.redirect).not.toHaveBeenCalled();
    expect(analyticsPageMocks.createClient).not.toHaveBeenCalled();
    expect(analyticsPageMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("loads payroll analytics rows through Supabase RLS before auditing and rendering", async () => {
    analyticsPageMocks.requireCanReadPayrollAnalytics.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000101",
      role: "hr_central",
    });
    analyticsPageMocks.recordAuditEvent.mockResolvedValue(undefined);
    const client = createAnalyticsClient([
      {
        agency_name: "Agence Nord",
        deductions_total: 250000,
        employee_id: "EMP-001",
        employee_name: "Employee One",
        gross_amount: 1500000,
        net_amount: 1250000,
        period_end: "2026-06-30",
        period_start: "2026-06-01",
      },
    ]);
    analyticsPageMocks.createClient.mockResolvedValue(client);

    const { default: AnalyticsPage } = await import("@/app/hr/analytics/page");

    render(await AnalyticsPage());

    expect(client.from).toHaveBeenCalledWith("payroll_analytics_rows");
    expect(client.query.select).toHaveBeenCalledWith(
      "agency_name,employee_id,employee_name,period_start,period_end,gross_amount,deductions_total,net_amount",
    );
    expect(screen.getByText("Agence Nord")).toBeTruthy();
    expect(screen.getByText("Employee One")).toBeTruthy();
    expect(screen.getByText("EMP-001")).toBeTruthy();
    expect(analyticsPageMocks.recordAuditEvent).toHaveBeenCalledWith({
      action: "ANALYTICS_VIEWED",
      actorProfileId: "00000000-0000-0000-0000-000000000101",
      actorRole: "hr_central",
      resourceType: "payroll_analytics",
    });
    expect(client.from.mock.invocationCallOrder[0]).toBeLessThan(
      analyticsPageMocks.recordAuditEvent.mock.invocationCallOrder[0],
    );
  });
});

function createAnalyticsClient(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null });
  const query = {
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    then: result.then.bind(result),
  };

  return {
    from: vi.fn(() => query),
    query,
  };
}
