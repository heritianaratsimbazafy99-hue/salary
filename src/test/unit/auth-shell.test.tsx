import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppRole } from "../../lib/roles";
import { RoleNav } from "../../components/shell/RoleNav";

vi.mock("server-only", () => ({}));

function roleLinks(role: AppRole) {
  cleanup();
  render(<RoleNav role={role} />);

  return screen.getAllByRole("link").map((link) => ({
    href: link.getAttribute("href"),
    label: link.textContent,
  }));
}

describe("RoleNav", () => {
  it("uses route-plan hrefs for each application role", () => {
    expect(roleLinks("agency_manager")).toEqual([{ href: "/manager/imports", label: "Imports" }, { href: "/help", label: "Guide" }]);

    expect(roleLinks("employee")).toEqual([{ href: "/employee/payslips", label: "Mes fiches" }, { href: "/help", label: "Guide" }]);

    expect(roleLinks("hr_central")).toEqual([
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/hr/analytics", label: "Analyses" },
      { href: "/hr/exports", label: "Exports" },
      { href: "/help", label: "Guide" },
    ]);

    expect(roleLinks("super_admin")).toEqual([
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/hr/analytics", label: "Analyses" },
      { href: "/hr/exports", label: "Exports" },
      { href: "/hr/operations", label: "Opérations" },
      { href: "/help", label: "Guide" },
    ]);
  });
});

describe("Supabase admin client exports", () => {
  it("exposes createAdminClient as the canonical admin factory", async () => {
    const adminModule = await import("../../lib/supabase/admin");

    expect(adminModule.createAdminClient).toBeTypeOf("function");
    expect(adminModule.createAdminSupabaseClient).toBe(adminModule.createAdminClient);
  });
});
