import { redirect } from "next/navigation";
import { ArrowRightLeft, Eye, Search } from "lucide-react";
import { EmployeeDirectory } from "@/components/hr/EmployeeDirectory";
import { AssignmentBoard, PlanningSection, ReplacementBoard } from "@/components/hr/PlanningBoard";
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
import { listAssignments, listReplacements } from "@/lib/hr/planning";
export const dynamic = "force-dynamic";
export default async function ClientPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  let scope: CurrentHrScope;
  try { scope = await getCurrentHrScope(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace client" />;
    throw error;
  }
  if (scope.actor.role !== "client_viewer") return <AccessDenied context="Espace client" />;
  const params = await searchParams ?? {};
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [directory, assignments, replacements, dashboard] = await Promise.all([
    listDirectory({ search: params.q, page }), listAssignments({ status: "ACTIVE" }), listReplacements(), getDashboard(),
  ]);
  const pageHref = (next: number) => `/client?${new URLSearchParams({ q: params.q ?? "", page: String(next) })}`;
  return <AppShell role={scope.actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace client" title="Mes sites" icon={Eye} description="Suivi opérationnel des sites qui vous sont attribués : effectifs, affectations et remplacements. Aucune donnée personnelle, de paie ou de congé n’est accessible depuis cet espace." />
    <ScopeSummary scope={scope} />
    {dashboard ? <section aria-label="Indicateurs de vos sites" className="grid min-w-0 gap-4"><h2 className="font-display text-lg font-semibold">Indicateurs de vos sites</h2>
      <HrDashboardView dashboard={dashboard} exportQuery={new URLSearchParams({ from: dashboard.period.start, to: dashboard.period.end }).toString()}
        exports={[{ kind: "workforce", label: "Effectifs et contrats" }, { kind: "replacements", label: "Remplacements" }]} /></section> : null}
    <PlanningSection id="replacements" icon={ArrowRightLeft} title="Remplacements" description="Absences couvertes ou à couvrir sur vos sites. Les motifs d’absence ne sont pas communiqués.">
      <ReplacementBoard entries={replacements.entries.filter((r) => r.status !== "CANCELLED")} />
    </PlanningSection>
    <PlanningSection id="assignments" title="Affectations actives" description="Collaborateurs actuellement affectés à vos sites.">
      <AssignmentBoard entries={assignments.entries} />
    </PlanningSection>
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
