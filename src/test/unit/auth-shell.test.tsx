import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppRole } from "../../lib/roles";
import { RoleNav } from "../../components/shell/RoleNav";

vi.mock("server-only", () => ({}));
const navigation = vi.hoisted(() => ({ pathname: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function roleLinks(role: AppRole) {
  cleanup();
  render(<RoleNav role={role} />);

  return screen.getAllByRole("link").map((link) => ({
    href: link.getAttribute("href"),
    label: link.querySelector("[data-nav-label]")?.textContent ?? link.textContent,
  }));
}

describe("RoleNav", () => {
  it("uses route-plan hrefs for each application role", () => {
    expect(roleLinks("agency_manager")).toEqual([{ href: "/manager/employees", label: "Salariés" }, { href: "/manager/imports", label: "Imports de paie" }, { href: "/help", label: "Guide" }]);

    expect(roleLinks("employee")).toEqual([{ href: "/employee/payslips", label: "Mes fiches" }, { href: "/employee/leaves", label: "Mes congés" }, { href: "/employee/requests", label: "Demandes" }, { href: "/employee/profile", label: "Mon dossier" }, { href: "/help", label: "Guide" }]);

    const hrLinks = [
      { href: "/hr/dashboard", label: "Tableau de bord" },
      { href: "/hr/employees", label: "Collaborateurs" },
      { href: "/hr/leaves", label: "Congés" },
      { href: "/hr/planning", label: "Planning" },
      { href: "/hr/requests", label: "Demandes RH" },
      { href: "/hr/agency-requests", label: "Demandes des agences" },
      { href: "/hr/analytics", label: "Analyses" },
      { href: "/hr/exports", label: "Exports" },
    ];

    expect(roleLinks("hr_central")).toEqual([
      ...hrLinks,
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/organisation", label: "Organisation" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/help", label: "Guide" },
    ]);

    expect(roleLinks("super_admin")).toEqual([
      ...hrLinks,
      { href: "/hr/agencies", label: "Agences" },
      { href: "/hr/organisation", label: "Organisation" },
      { href: "/hr/users", label: "Utilisateurs" },
      { href: "/hr/access", label: "Accès RH" },
      { href: "/hr/audit", label: "Audit" },
      { href: "/hr/operations", label: "Opérations" },
      { href: "/help", label: "Guide" },
    ]);

    expect(roleLinks("team_manager")).toEqual([{ href: "/team", label: "Mon équipe" }, { href: "/team/leaves", label: "Congés" }, { href: "/team/planning", label: "Planning" }, { href: "/help", label: "Guide" }]);

    expect(roleLinks("client_viewer")).toEqual([{ href: "/client", label: "Mes sites" }, { href: "/help", label: "Guide" }]);
  });
});

describe("RoleNav current link", () => {
  it("marks only the most specific matching destination as current", () => {
    navigation.pathname = "/team/leaves";
    cleanup();
    render(<RoleNav role="team_manager" />);
    expect(screen.getByRole("link", { name: "Congés" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Mon équipe" }).getAttribute("aria-current")).toBeNull();
    navigation.pathname = "";
  });
});

describe("RoleNav mobile overflow", () => {
  it("keeps every destination reachable through the Plus sheet and closes it with Escape", () => {
    cleanup();
    render(<RoleNav role="hr_central" />);
    const more = screen.getByRole("button", { name: "Plus" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Fermer" }).getAttribute("aria-expanded")).toBe("true");
    const sheet = document.getElementById("nav-more");
    expect(sheet?.textContent).toContain("Agences");
    expect(sheet?.textContent).toContain("Guide");
    expect(sheet?.textContent).not.toContain("Tableau de bord");
    expect(document.activeElement).toBe(sheet?.querySelector("a"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.getElementById("nav-more")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("does not add a Plus button when every destination fits", () => {
    cleanup();
    render(<RoleNav role="employee" />);
    expect(screen.queryByRole("button", { name: "Plus" })).toBeNull();
  });
});

describe("Supabase admin client exports", () => {
  it("exposes createAdminClient as the canonical admin factory", async () => {
    const adminModule = await import("../../lib/supabase/admin");

    expect(adminModule.createAdminClient).toBeTypeOf("function");
    expect(adminModule.createAdminSupabaseClient).toBe(adminModule.createAdminClient);
  });
});
