import { redirect } from "next/navigation";
import { Building2, CalendarRange, LayoutDashboard } from "lucide-react";
import { HrDashboardView } from "@/components/hr/HrDashboardView";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Surface";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { getDashboard } from "@/lib/hr/reporting";
export const dynamic = "force-dynamic";
export default async function HrDashboardPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string; month?: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Tableau de bord RH" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month : new Date().toISOString().slice(0, 7);
  const [agencies, dashboard] = await Promise.all([listAgencies(), getDashboard({ agencyId: params.agencyId, month })]);
  const exportQuery = new URLSearchParams({ ...(params.agencyId ? { agencyId: params.agencyId } : {}), ...(dashboard ? { from: dashboard.period.start, to: dashboard.period.end } : {}) }).toString();
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Ressources humaines" title="Tableau de bord RH" icon={LayoutDashboard} description="Effectifs, couverture, absences, remplacements, échéances de contrat et suivi administratif, par agence et par mois." />
    <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end" aria-label="Filtrer le tableau de bord">
      <div className="grid min-w-0 gap-2"><label htmlFor="dashboard-agency" className={labelClass}>Agence</label>
        <select id="dashboard-agency" name="agencyId" defaultValue={params.agencyId ?? ""} className={fieldClass}><option value="">Toutes les agences</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <Input id="dashboard-month" label="Mois" name="month" type="month" defaultValue={month} />
      <Button type="submit" variant="secondary"><CalendarRange className="size-4" aria-hidden="true" />Afficher</Button>
    </form>
    {dashboard ? <HrDashboardView dashboard={dashboard} exportQuery={exportQuery} exports={[
      { kind: "workforce", label: "Effectifs et contrats" }, { kind: "leaves", label: "Congés approuvés (pour la paie)" }, { kind: "replacements", label: "Remplacements" },
    ]} /> : <EmptyState icon={Building2} title="Indicateurs indisponibles." />}
  </div></AppShell>;
}
