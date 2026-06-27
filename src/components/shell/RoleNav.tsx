"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Building2, FileText, FileUp, ScrollText, Users } from "lucide-react";

import type { AppRole } from "@/lib/roles";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const LINKS_BY_ROLE: Record<AppRole, NavLink[]> = {
  agency_manager: [{ href: "/manager/imports", label: "Imports", icon: FileUp }],
  employee: [{ href: "/employee/payslips", label: "Mes fiches", icon: FileText }],
  hr_central: [
    { href: "/hr/agencies", label: "Agences", icon: Building2 },
    { href: "/hr/users", label: "Utilisateurs", icon: Users },
    { href: "/hr/audit", label: "Audit", icon: ScrollText },
    { href: "/hr/analytics", label: "Analyses", icon: BarChart3 },
  ],
  super_admin: [
    { href: "/hr/agencies", label: "Agences", icon: Building2 },
    { href: "/hr/users", label: "Utilisateurs", icon: Users },
    { href: "/hr/audit", label: "Audit", icon: ScrollText },
    { href: "/hr/analytics", label: "Analyses", icon: BarChart3 },
  ],
};

type RoleNavProps = {
  role: AppRole;
};

export function RoleNav({ role }: RoleNavProps) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Navigation principale"
      className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/70 bg-surface/70 p-1 shadow-[var(--shadow-xs)] backdrop-blur-sm"
    >
      {LINKS_BY_ROLE[role].map((link) => {
        const isCurrent = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
              isCurrent
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            href={link.href}
            key={link.href}
          >
            <link.icon
              className={`size-4 ${isCurrent ? "" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
