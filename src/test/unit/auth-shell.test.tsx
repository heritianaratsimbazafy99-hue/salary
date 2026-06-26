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
    expect(roleLinks("agency_manager")).toEqual([
      { href: "/manager", label: "Tableau de bord" },
      { href: "/manager/imports", label: "Imports" },
    ]);

    expect(roleLinks("employee")).toEqual([{ href: "/employee/payslips", label: "Mes fiches" }]);

    expect(roleLinks("hr_central")).toEqual([
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/hr/analytics", label: "Analyses" },
    ]);

    expect(roleLinks("super_admin")).toEqual([
      { href: "/admin", label: "Admin" },
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/hr/analytics", label: "Analyses" },
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
