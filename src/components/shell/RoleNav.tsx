"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Activity, BarChart3, BookOpen, Building2, Download, FileText, FileUp, ScrollText, Users } from "lucide-react";

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
    { href: "/hr/exports", label: "Exports", icon: Download },
  ],
  super_admin: [
    { href: "/hr/agencies", label: "Agences", icon: Building2 },
    { href: "/hr/users", label: "Utilisateurs", icon: Users },
    { href: "/hr/audit", label: "Audit", icon: ScrollText },
    { href: "/hr/analytics", label: "Analyses", icon: BarChart3 },
    { href: "/hr/exports", label: "Exports", icon: Download },
    { href: "/hr/operations", label: "Opérations", icon: Activity },
  ],
};

type RoleNavProps = {
  role: AppRole;
};

/**
 * Primary navigation. One element, two layouts:
 * - mobile: floating bottom tab bar (scrolls horizontally when a role has
 *   more destinations than fit),
 * - desktop: vertical list inside the dark sidebar.
 * Link text is exactly the label (icons are decorative).
 */
export function RoleNav({ role }: RoleNavProps) {
  const pathname = usePathname() ?? "";
  const links = [...LINKS_BY_ROLE[role], { href: "/help", label: "Guide", icon: BookOpen }];
  const compact = links.length <= 4;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-3 bottom-3 z-50 rounded-[1.4rem] border border-ink-foreground/10 bg-ink/95 p-1.5 text-ink-foreground shadow-[var(--shadow-lg)] backdrop-blur-xl pb-safe lg:static lg:inset-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
    >
      <ul
        className={`no-scrollbar flex snap-x gap-1 overflow-x-auto lg:flex-col lg:overflow-visible ${
          compact ? "justify-around" : ""
        }`}
      >
        {links.map((link) => {
          const isCurrent = pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li className={`snap-start ${compact ? "flex-1" : "shrink-0"} lg:flex-none`} key={link.href}>
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`group relative flex min-h-14 min-w-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-1.5 text-[0.7rem] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-sm ${
                  isCurrent
                    ? "text-ink-foreground lg:bg-ink-foreground/10"
                    : "text-ink-muted hover:text-ink-foreground lg:hover:bg-ink-foreground/[0.06]"
                }`}
                href={link.href}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-11 items-center justify-center rounded-full transition-all duration-300 lg:size-8 lg:rounded-lg ${
                    isCurrent
                      ? "bg-accent text-accent-foreground shadow-[0_6px_18px_-6px_hsl(var(--accent)/0.7)]"
                      : "group-hover:bg-ink-foreground/10"
                  }`}
                >
                  <link.icon className="size-[1.1rem]" aria-hidden="true" />
                </span>
                {link.label}
                {isCurrent ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-full bg-accent lg:block"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
