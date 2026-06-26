import Link from "next/link";

import type { AppRole } from "@/lib/roles";
import { RoleNav } from "./RoleNav";

type AppShellProps = {
  children: React.ReactNode;
  role: AppRole;
};

export function AppShell({ children, role }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span>
              <span className="block text-sm font-semibold">Salary</span>
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
