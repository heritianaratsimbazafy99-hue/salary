import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowRightLeft, Building2, CalendarRange, MapPin } from "lucide-react";
import { runCancelReplacement, runConfirmReplacement, runSaveAssignment } from "@/components/hr/planning-actions";
import { AssignmentBoard, PlanningSection, ReplacementBoard } from "@/components/hr/PlanningBoard";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Surface";
import { fieldClass, labelClass } from "@/components/ui/Input";
import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { listDirectory } from "@/lib/hr/employees";
import { listAssignments, listReplacementCandidates, listReplacements } from "@/lib/hr/planning";
import { listHrReferential } from "@/lib/hr/referential";
export const dynamic = "force-dynamic";
async function save(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runSaveAssignment(form); revalidatePath("/hr/planning"); return r; }
async function confirm(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runConfirmReplacement(form); revalidatePath("/hr/planning"); return r; }
async function cancel(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runCancelReplacement(form); revalidatePath("/hr/planning"); return r; }
export default async function HrPlanningPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Planning" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const agencies = await listAgencies();
  const agency = agencies.find((a) => a.id === params.agencyId) ?? agencies.find((a) => a.is_active) ?? agencies[0];
  if (!agency) return <AppShell role={actor.role}><EmptyState icon={Building2} title="Aucune agence enregistrée." /></AppShell>;
  const [assignments, replacements, referential, directory] = await Promise.all([
    listAssignments({ agencyId: agency.id }), listReplacements({ agencyId: agency.id }), listHrReferential(agency.id), listDirectory({ agencyId: agency.id, pageSize: 100 }),
  ]);
  const open = replacements.entries.filter((r) => r.status === "OPEN");
  const candidates = Object.fromEntries(await Promise.all(open.slice(0, 20).map(async (r) => [r.id, await listReplacementCandidates(r.id)] as const)));
  const employees = directory.entries.filter((e) => e.has_record).map((e) => ({ id: e.employee_id, label: `${e.full_name} (${e.matricule})` }));
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Ressources humaines" title="Planning" icon={CalendarRange} description="Affectations par site et équipe ; remplacements créés à l’approbation d’un congé.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={MapPin} label="Actives" value={assignments.entries.filter((a) => a.status === "ACTIVE").length} />
        <HeaderStat icon={CalendarRange} label="Planifiées" value={assignments.entries.filter((a) => a.status === "PLANNED").length} />
        <HeaderStat icon={ArrowRightLeft} label="À pourvoir" value={open.length} />
      </div>
    </PageHeader>
    <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end" aria-label="Choisir une agence">
      <div className="grid min-w-0 gap-2"><label htmlFor="planning-agency" className={labelClass}>Agence</label>
        <select id="planning-agency" name="agencyId" defaultValue={agency.id} className={fieldClass}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <Button type="submit" variant="secondary"><Building2 className="size-4" aria-hidden="true" />Afficher</Button>
    </form>
    <PlanningSection id="replacements" icon={ArrowRightLeft} title="Remplacements" description="Seuls les collaborateurs actifs, sous contrat, sans absence ni autre remplacement sur la période sont proposés.">
      <ReplacementBoard entries={replacements.entries} candidates={candidates} confirmAction={confirm} cancelAction={cancel} />
    </PlanningSection>
    <PlanningSection id="assignments" title="Affectations" description="Une affectation doit être comprise dans le contrat ; deux affectations en cours d’un même collaborateur ne peuvent pas se chevaucher.">
      <AssignmentBoard entries={assignments.entries} employees={employees} referential={referential} saveAction={save} />
    </PlanningSection>
  </div></AppShell>;
}
