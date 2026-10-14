import type { LucideIcon } from "lucide-react";
import { Building2, Eye, LifeBuoy, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";

import type { AppRole } from "@/lib/roles";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { RoleNav } from "./RoleNav";
import { logout } from "@/app/auth/logout/actions";
import styles from "./AppShell.module.css";

type AppShellProps = {
  children: React.ReactNode;
  role: AppRole;
};

const ROLE_LABEL: Record<AppRole, string> = {
  employee: "Espace salarié",
  agency_manager: "Espace manager",
  hr_central: "Administration RH",
  super_admin: "Administration RH",
  team_manager: "Espace équipe",
  client_viewer: "Espace client",
};

const ROLE_CARD: Record<AppRole, { title: string; description: string; icon: LucideIcon }> = {
  employee: { title: "Salarié", description: "Vos fiches de paie, en clair.", icon: UserRound },
  agency_manager: { title: "Manager d'agence", description: "Importez, contrôlez, publiez.", icon: Building2 },
  hr_central: { title: "RH centrale", description: "Pilotage multi-agences.", icon: ShieldCheck },
  super_admin: { title: "Super administrateur", description: "Administration complète.", icon: ShieldCheck },
  team_manager: { title: "Manager RH", description: "Congés, affectations, remplacements.", icon: UsersRound },
  client_viewer: { title: "Client", description: "Suivi opérationnel de vos sites.", icon: Eye },
};

/**
 * Application frame.
 * - Desktop (≥ lg): dark brand sidebar with role card, navigation and logout.
 * - Mobile: compact top bar (logo + logout) and a floating bottom tab bar.
 * The navigation and logout exist once in the DOM; only their layout changes.
 */
export function AppShell({ children, role }: AppShellProps) {
  const card = ROLE_CARD[role];

  return (
    <div className={`${styles.shell} app-canvas relative min-h-dvh text-foreground lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]`}>
      <a
        href="#app-content"
        className={`${styles.chrome} sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground`}
      >
        Aller au contenu
      </a>

      <aside
        className={`${styles.chrome} sticky top-0 z-40 flex h-16 items-center gap-3 px-4 sm:px-6 lg:sidebar-surface lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:px-4 lg:py-5 lg:text-ink-foreground`}
      >
        {/* Mobile top-bar surface (kept off the ancestor chain of the fixed tab bar). */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 border-b border-border/70 bg-surface/85 backdrop-blur-xl lg:hidden" />

        <div className="min-w-0 lg:hidden">
          <BrandLogo subtitle={ROLE_LABEL[role]} markSize={34} priority />
        </div>
        <div className="hidden px-2 lg:block">
          <BrandLogo subtitle={ROLE_LABEL[role]} markSize={38} inverted />
        </div>

        <div className="mt-6 hidden items-center gap-3 rounded-2xl border border-ink-foreground/10 bg-ink-foreground/[0.06] p-3 lg:flex">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-sm)]">
            <card.icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{card.title}</span>
            <span className="block truncate text-xs text-ink-muted">{card.description}</span>
          </span>
        </div>

        {/* Grouped menus (HR roles) carry their own section titles. */}
        <p className={`mb-2 mt-7 hidden px-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted/80 ${role === "hr_central" || role === "super_admin" ? "" : "lg:block"}`}>
          Navigation
        </p>
        {role === "hr_central" || role === "super_admin" ? <div aria-hidden="true" className="hidden h-6 lg:block" /> : null}
        <RoleNav role={role} />

        {/* Roles with a long grouped menu keep the Guide link instead of this card. */}
        <div className={`mt-auto hidden rounded-2xl border border-ink-foreground/10 bg-gradient-to-br from-teal/25 to-accent/10 p-4 ${role === "hr_central" || role === "super_admin" ? "" : "lg:block"}`}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink-foreground/10 text-accent">
            <LifeBuoy className="size-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold">Besoin d&apos;aide ?</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Le guide explique chaque étape, pas à pas.
          </p>
        </div>

        <form action={logout} className="ml-auto lg:ml-0 lg:mt-3 lg:shrink-0">
          <button
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:w-full lg:text-ink-muted lg:hover:bg-ink-foreground/10 lg:hover:text-ink-foreground lg:focus-visible:ring-accent"
            type="submit"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Se déconnecter</span>
          </button>
        </form>
      </aside>

      <main
        id="app-content"
        className={`${styles.content} min-w-0 px-4 pb-32 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-14 lg:pt-10`}
      >
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

