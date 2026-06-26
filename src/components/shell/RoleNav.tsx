import Link from "next/link";

import type { AppRole } from "@/lib/roles";

type NavLink = {
  href: string;
  label: string;
};

const LINKS_BY_ROLE: Record<AppRole, NavLink[]> = {
  agency_manager: [
    { href: "/manager", label: "Tableau de bord" },
    { href: "/manager/imports", label: "Imports" },
  ],
  employee: [{ href: "/employee/payslips", label: "Mes fiches" }],
  hr_central: [
    { href: "/hr/agencies", label: "Agences" },
    { href: "/hr/users", label: "Utilisateurs" },
    { href: "/hr/audit", label: "Audit" },
    { href: "/hr/analytics", label: "Analyses" },
  ],
  super_admin: [
    { href: "/admin", label: "Admin" },
    { href: "/hr/agencies", label: "Agences" },
    { href: "/hr/users", label: "Utilisateurs" },
    { href: "/hr/audit", label: "Audit" },
    { href: "/hr/analytics", label: "Analyses" },
  ],
};

type RoleNavProps = {
  role: AppRole;
};

export function RoleNav({ role }: RoleNavProps) {
  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1">
      {LINKS_BY_ROLE[role].map((link) => (
        <Link
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
