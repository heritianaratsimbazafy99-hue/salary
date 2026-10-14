import { redirect } from "next/navigation";
import { UsersRound, Search } from "lucide-react";
import { EmployeeDirectory } from "@/components/hr/EmployeeDirectory";
import { HrDashboardView } from "@/components/hr/HrDashboardView";
import { ScopeSummary } from "@/components/hr/ScopeSummary";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { getCurrentHrScope, type CurrentHrScope } from "@/lib/hr/access";
import { listDirectory } from "@/lib/hr/employees";
import { getDashboard } from "@/lib/hr/reporting";
export const dynamic = "force-dynamic";
export default async function TeamPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  let scope: CurrentHrScope;
  try { scope = await getCurrentHrScope(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace équipe" />;
    throw error;
  }
  if (scope.actor.role !== "team_manager") return <AccessDenied context="Espace équipe" />;
  const params = await searchParams ?? {};
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [directory, dashboard] = await Promise.all([listDirectory({ search: params.q, page }), getDashboard()]);
  const pageHref = (next: number) => `/team?${new URLSearchParams({ q: params.q ?? "", page: String(next) })}`;
  return <AppShell role={scope.actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace équipe" title="Mon équipe" icon={UsersRound} description="Collaborateurs, congés, affectations et remplacements de votre périmètre. Les bulletins et documents personnels ne sont pas accessibles depuis cet espace." />
    <ScopeSummary scope={scope} />
    {dashboard ? <section aria-label="Indicateurs de votre périmètre" className="grid min-w-0 gap-4"><h2 className="font-display text-lg font-semibold">Indicateurs de votre périmètre</h2>
      <HrDashboardView dashboard={dashboard} exportQuery={new URLSearchParams({ from: dashboard.period.start, to: dashboard.period.end }).toString()}
        exports={[{ kind: "workforce", label: "Effectifs et contrats" }, { kind: "replacements", label: "Remplacements" }]} /></section> : null}
    <section aria-labelledby="directory" className="grid min-w-0 gap-4">
      <h2 id="directory" className="font-display text-lg font-semibold">Collaborateurs</h2>
      <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end" aria-label="Rechercher un collaborateur">
        <Input id="directory-search" label="Nom ou matricule" name="q" defaultValue={params.q ?? ""} maxLength={160} />
        <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden="true" />Rechercher</Button>
      </form>
      <EmployeeDirectory entries={directory.entries} count={directory.count} page={page} pageHref={pageHref} />
    </section>
  </div></AppShell>;
}
