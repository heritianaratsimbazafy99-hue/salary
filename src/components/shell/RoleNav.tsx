"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppRole } from "@/lib/roles";

type NavLink = {
  href: string;
  label: string;
};

const LINKS_BY_ROLE: Record<AppRole, NavLink[]> = {
  agency_manager: [{ href: "/manager/imports", label: "Imports" }],
  employee: [{ href: "/employee/payslips", label: "Mes fiches" }],
  hr_central: [
    { href: "/hr/agencies", label: "Agences" },
    { href: "/hr/users", label: "Utilisateurs" },
    { href: "/hr/audit", label: "Audit" },
    { href: "/hr/analytics", label: "Analyses" },
  ],
  super_admin: [
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
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1">
      {LINKS_BY_ROLE[role].map((link) => {
        const isCurrent = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className={
              isCurrent
                ? "rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                : "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            }
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
