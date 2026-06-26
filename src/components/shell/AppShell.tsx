import Link from "next/link";

import type { AppRole } from "@/lib/roles";
import { RoleNav } from "./RoleNav";

type AppShellProps = {
  children: React.ReactNode;
  role: AppRole;
};

export function AppShell({ children, role }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link className="group flex items-center gap-3" href="/">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground shadow-[var(--shadow-sm)] transition-transform duration-300 group-hover:-translate-y-0.5">
              S
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-semibold tracking-tight">Salary</span>
              <span className="block text-xs text-muted-foreground">Paie interne</span>
            </span>
          </Link>
          <RoleNav role={role} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-6">{children}</main>
    </div>
  );
}
