import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auditPageMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  requireCanReadPayrollAnalytics: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: auditPageMocks.redirect,
}));

vi.mock("@/lib/admin/auth", () => ({
  requireCanReadPayrollAnalytics: auditPageMocks.requireCanReadPayrollAnalytics,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: auditPageMocks.createClient,
}));

describe("AuditPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    auditPageMocks.createClient.mockReset();
    auditPageMocks.redirect.mockReset();
    auditPageMocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    auditPageMocks.requireCanReadPayrollAnalytics.mockReset();
  });

  it("redirects unauthenticated users to login before reading audit logs", async () => {
    auditPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Authentification requise."),
    );

    const { default: AuditPage } = await import("@/app/hr/audit/page");

    await expect(Promise.resolve().then(() => AuditPage())).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
    expect(auditPageMocks.redirect).toHaveBeenCalledWith("/auth/login");
    expect(auditPageMocks.createClient).not.toHaveBeenCalled();
  });

  it("renders a forbidden state for roles outside HR central and super admin", async () => {
    auditPageMocks.requireCanReadPayrollAnalytics.mockRejectedValue(
      new Error("Action non autorisee."),
    );

    const { default: AuditPage } = await import("@/app/hr/audit/page");

    render(await AuditPage());

    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Journal d'audit" })).toBeNull();
    expect(auditPageMocks.createClient).not.toHaveBeenCalled();
  });

  it("loads recent audit logs through the server Supabase client and renders them", async () => {
    auditPageMocks.requireCanReadPayrollAnalytics.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000101",
      role: "hr_central",
    });
    const client = createAuditClient([
      {
        action: "PAYROLL_IMPORT_PUBLISHED",
        actor_role: "agency_manager",
        created_at: "2026-06-26T08:30:00.000Z",
        id: "00000000-0000-0000-0000-000000000501",
        resource_type: "payroll_import",
      },
    ]);
    auditPageMocks.createClient.mockResolvedValue(client);

    const { default: AuditPage } = await import("@/app/hr/audit/page");

    render(await AuditPage());

    expect(client.from).toHaveBeenCalledWith("audit_logs");
    expect(client.query.select).toHaveBeenCalledWith(
      "id,actor_role,action,resource_type,created_at",
    );
    expect(client.query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(client.query.limit).toHaveBeenCalledWith(50);
    expect(screen.getByText("PAYROLL_IMPORT_PUBLISHED")).toBeTruthy();
    expect(screen.getByText("agency_manager")).toBeTruthy();
    expect(screen.getByText("payroll_import")).toBeTruthy();
  });
});

function createAuditClient(rows: unknown[]) {
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
