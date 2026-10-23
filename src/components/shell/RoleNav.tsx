"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, BookOpen, Building2, CalendarDays, CalendarRange, Contact, Download, Eye, FileText, FileUp, IdCard, KeyRound,
  LayoutDashboard, MessageSquareText, MoreHorizontal, Network, ScrollText, Users, UsersRound, X,
} from "lucide-react";

import type { AppRole } from "@/lib/roles";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shorter label for the mobile bottom bar; the full label stays the accessible name. */
  short?: string;
};
type NavGroup = { label?: string; links: NavLink[] };

const HR_LINKS: NavLink[] = [
  { href: "/hr/dashboard", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/hr/employees", label: "Collaborateurs", short: "Salariés", icon: Contact },
  { href: "/hr/leaves", label: "Congés", icon: CalendarDays },
  { href: "/hr/planning", label: "Planning", icon: CalendarRange },
  { href: "/hr/requests", label: "Demandes RH", short: "Demandes", icon: MessageSquareText },
  { href: "/hr/agency-requests", label: "Demandes des agences", short: "Agences", icon: UsersRound },
];
const PAYROLL_LINKS: NavLink[] = [
  { href: "/hr/analytics", label: "Analyses", icon: BarChart3 },
  { href: "/hr/exports", label: "Exports", icon: Download },
];

const GROUPS_BY_ROLE: Record<AppRole, NavGroup[]> = {
  agency_manager: [{ links: [{ href: "/manager/employees", label: "Salariés", icon: Contact }, { href: "/manager/imports", label: "Imports de paie", short: "Paie", icon: FileUp }] }],
  employee: [{ links: [
    { href: "/employee/payslips", label: "Mes fiches", short: "Fiches", icon: FileText },
    { href: "/employee/leaves", label: "Mes congés", short: "Congés", icon: CalendarDays },
    { href: "/employee/requests", label: "Demandes", icon: MessageSquareText },
    { href: "/employee/profile", label: "Mon dossier", short: "Dossier", icon: IdCard },
  ] }],
  hr_central: [
    { label: "Ressources humaines", links: HR_LINKS },
    { label: "Paie", links: PAYROLL_LINKS },
    { label: "Administration", links: [
      { href: "/hr/agencies", label: "Agences", icon: Building2 },
      { href: "/hr/organisation", label: "Organisation", icon: Network },
      { href: "/hr/users", label: "Utilisateurs", icon: Users },
      { href: "/hr/audit", label: "Audit", icon: ScrollText },
    ] },
  ],
  super_admin: [
    { label: "Ressources humaines", links: HR_LINKS },
    { label: "Paie", links: PAYROLL_LINKS },
    { label: "Administration", links: [
      { href: "/hr/agencies", label: "Agences", icon: Building2 },
      { href: "/hr/organisation", label: "Organisation", icon: Network },
      { href: "/hr/users", label: "Utilisateurs", icon: Users },
      { href: "/hr/access", label: "Accès RH", icon: KeyRound },
      { href: "/hr/audit", label: "Audit", icon: ScrollText },
      { href: "/hr/operations", label: "Opérations", icon: Activity },
    ] },
  ],
  team_manager: [{ links: [
    { href: "/team", label: "Mon équipe", short: "Équipe", icon: UsersRound },
    { href: "/team/leaves", label: "Congés", icon: CalendarDays },
    { href: "/team/planning", label: "Planning", icon: CalendarRange },
  ] }],
  client_viewer: [{ links: [{ href: "/client", label: "Mes sites", icon: Eye }] }],
};

const GUIDE: NavLink = { href: "/help", label: "Guide", icon: BookOpen };
/** Bottom-bar slots on mobile; beyond that, the remaining links move to "Plus". */
const MOBILE_SLOTS = 5;

type RoleNavProps = {
  role: AppRole;
};

function linkClass(isCurrent: boolean) {
  return `group relative flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-center text-[0.7rem] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-left lg:text-sm ${
    isCurrent ? "text-ink-foreground lg:bg-ink-foreground/10" : "text-ink-muted hover:text-ink-foreground lg:hover:bg-ink-foreground/[0.06]"}`;
}

/** Mobile shows the short label; the full label remains the accessible name and the desktop text. */
function NavLabel({ link }: { link: NavLink }) {
  if (!link.short) return <span data-nav-label>{link.label}</span>;
  return <>
    <span aria-hidden="true" className="lg:hidden">{link.short}</span>
    <span data-nav-label className="sr-only lg:not-sr-only">{link.label}</span>
  </>;
}

function NavIcon({ icon: Icon, isCurrent }: { icon: LucideIcon; isCurrent: boolean }) {
  return <span aria-hidden="true" className={`flex h-7 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-300 lg:size-8 lg:rounded-lg ${
    isCurrent ? "bg-accent text-accent-foreground shadow-[0_6px_18px_-6px_hsl(var(--accent)/0.7)]" : "group-hover:bg-ink-foreground/10"}`}>
    <Icon className="size-[1.1rem]" aria-hidden="true" />
  </span>;
}

/**
 * Primary navigation. One element, two layouts:
 * - desktop: grouped vertical list inside the dark sidebar (scrolls if long),
 * - mobile: floating bottom tab bar with the first destinations; the others
 *   open from a "Plus" sheet so every destination stays one tap away.
 * Link text is exactly the label (icons are decorative).
 */
export function RoleNav({ role }: RoleNavProps) {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const groups = GROUPS_BY_ROLE[role];
  const lastGroup = groups[groups.length - 1];
  const groupsWithGuide: NavGroup[] = [...groups.slice(0, -1), { ...lastGroup, links: [...lastGroup.links, GUIDE] }];
  const links = groupsWithGuide.flatMap((group) => group.links);
  const overflow = links.length > MOBILE_SLOTS;
  const mobileVisible = new Set((overflow ? links.slice(0, MOBILE_SLOTS - 1) : links).map((link) => link.href));
  // Only the most specific match is current (e.g. /team/leaves, not also /team).
  const currentHref = links
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const currentInMore = !!currentHref && !mobileVisible.has(currentHref);

  useEffect(() => {
    if (!moreOpen) return;
    morePanelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-3 bottom-3 z-50 rounded-[1.4rem] border border-ink-foreground/10 bg-ink/95 p-1.5 text-ink-foreground shadow-[var(--shadow-lg)] backdrop-blur-xl pb-safe lg:static lg:inset-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
    >
      {moreOpen ? (
        <div ref={morePanelRef} id="nav-more" className="absolute inset-x-0 bottom-full mb-2 max-h-[70dvh] overflow-y-auto rounded-[1.4rem] border border-ink-foreground/10 bg-ink/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur-xl lg:hidden">
          {groupsWithGuide.map((group, index) => {
            const hidden = group.links.filter((link) => !mobileVisible.has(link.href));
            if (!hidden.length) return null;
            return <div key={group.label ?? index} className="mb-2 last:mb-0">
              {group.label ? <p className="px-2 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted/80">{group.label}</p> : null}
              <ul className="grid grid-cols-3 gap-1">
                {hidden.map((link) => {
                  const isCurrent = link.href === currentHref;
                  return <li key={link.href}><Link onClick={() => setMoreOpen(false)} aria-current={isCurrent ? "page" : undefined} className={linkClass(isCurrent)} href={link.href}>
                    <NavIcon icon={link.icon} isCurrent={isCurrent} /><span data-nav-label>{link.label}</span></Link></li>;
                })}
              </ul>
            </div>;
          })}
        </div>
      ) : null}
      <ul className="flex gap-1 lg:flex-col">
        {groupsWithGuide.map((group, groupIndex) => [
          group.label ? <li key={`label-${group.label}`} aria-hidden="true" className={`hidden px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted/80 lg:block ${groupIndex ? "pt-4" : ""}`}>{group.label}</li> : null,
          ...group.links.map((link) => {
            const isCurrent = link.href === currentHref;
            return (
              <li className={`min-w-0 flex-1 lg:flex-none ${mobileVisible.has(link.href) ? "" : "hidden lg:block"}`} key={link.href}>
                <Link aria-current={isCurrent ? "page" : undefined} className={linkClass(isCurrent)} href={link.href}>
                  <NavIcon icon={link.icon} isCurrent={isCurrent} />
                  <NavLabel link={link} />
                  {isCurrent ? <span aria-hidden="true" className="absolute right-2 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-full bg-accent lg:block" /> : null}
                </Link>
              </li>
            );
          }),
        ])}
        {overflow ? (
          <li className="min-w-0 flex-1 lg:hidden">
            <button ref={moreButtonRef} type="button" aria-expanded={moreOpen} aria-controls="nav-more" onClick={() => setMoreOpen((open) => !open)} className={linkClass(moreOpen || currentInMore)}>
              <NavIcon icon={moreOpen ? X : MoreHorizontal} isCurrent={moreOpen || currentInMore} />
              {moreOpen ? "Fermer" : "Plus"}
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
