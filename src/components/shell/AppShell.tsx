import type { AppRole } from "@/lib/roles";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
          <BrandLogo subtitle="Paie interne" markSize={36} priority />
          <RoleNav role={role} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-6">{children}</main>
    </div>
  );
}
