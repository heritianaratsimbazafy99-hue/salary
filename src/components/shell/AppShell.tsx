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
};

export function AppShell({ children, role }: AppShellProps) {
  return (
    <div className={`${styles.shell} relative min-h-dvh bg-background text-foreground`}>
      {/* Soft brand wash tying the app chrome to the marketing site, kept faint
          so data stays perfectly legible. */}
      <div
        aria-hidden="true"
        className={`${styles.chrome} brand-mesh pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 opacity-60`}
      />

      <header className={`${styles.chrome} sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <BrandLogo subtitle={ROLE_LABEL[role]} markSize={36} priority />
          <div className="flex flex-wrap items-center gap-3">
            <RoleNav role={role} />
            <form action={logout}>
              <button className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="submit">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
        {/* Brand hairline echoing the landing's gradient accents. */}
        <div
          aria-hidden="true"
          className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />
      </header>

      <main className={`${styles.content} mx-auto w-full max-w-6xl px-5 py-8 md:px-6`}>{children}</main>
    </div>
  );
}
