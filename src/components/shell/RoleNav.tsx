import Link from "next/link";

import type { AppRole } from "@/lib/roles";

type NavLink = {
  href: string;
  label: string;
};

const LINKS_BY_ROLE: Record<AppRole, NavLink[]> = {
  agency_manager: [
    { href: "/agence/imports", label: "Imports" },
    { href: "/agence/employes", label: "Employes" },
    { href: "/agence/fiches", label: "Fiches" },
  ],
  employee: [
    { href: "/mes-fiches", label: "Mes fiches" },
    { href: "/profil", label: "Profil" },
  ],
  hr_central: [
    { href: "/rh/agences", label: "Agences" },
    { href: "/rh/fiches", label: "Fiches" },
    { href: "/rh/audit", label: "Audit" },
  ],
  super_admin: [
    { href: "/admin", label: "Admin" },
    { href: "/admin/utilisateurs", label: "Utilisateurs" },
    { href: "/admin/audit", label: "Audit" },
  ],
};

type RoleNavProps = {
  role: AppRole;
};

export function RoleNav({ role }: RoleNavProps) {
  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-2">
      {LINKS_BY_ROLE[role].map((link) => (
        <Link
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
