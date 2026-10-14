import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowRightLeft, CalendarRange, MapPin } from "lucide-react";
import { runCancelReplacement, runConfirmReplacement, runSaveAssignment } from "@/components/hr/planning-actions";
import { AssignmentBoard, PlanningSection, ReplacementBoard } from "@/components/hr/PlanningBoard";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { getCurrentHrScope, type CurrentHrScope } from "@/lib/hr/access";
import { listDirectory } from "@/lib/hr/employees";
import { listAssignments, listReplacementCandidates, listReplacements } from "@/lib/hr/planning";
import { listHrReferential } from "@/lib/hr/referential";
export const dynamic = "force-dynamic";
async function save(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runSaveAssignment(form); revalidatePath("/team/planning"); return r; }
async function confirm(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runConfirmReplacement(form); revalidatePath("/team/planning"); return r; }
async function cancel(form: FormData): Promise<AdminFormResult> { "use server"; const r = await runCancelReplacement(form); revalidatePath("/team/planning"); return r; }
export default async function TeamPlanningPage() {
  let scope: CurrentHrScope;
  try { scope = await getCurrentHrScope(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace équipe" />;
    throw error;
  }
  if (scope.actor.role !== "team_manager") return <AccessDenied context="Espace équipe" />;
  const [assignments, replacements, referential, directory] = await Promise.all([
    listAssignments(), listReplacements(), listHrReferential(scope.agency?.id), listDirectory({ pageSize: 100 }),
  ]);
  // Only sites of the scope are offered (or every site of the agency for a department-only scope).
  const siteScope = new Set(scope.sites.map((s) => s.id));
  const sites = siteScope.size ? { ...referential, sites: referential.sites.filter((s) => siteScope.has(s.id)), teams: referential.teams.filter((t) => siteScope.has(t.site_id)) } : referential;
  const open = replacements.entries.filter((r) => r.status === "OPEN");
  const candidates = Object.fromEntries(await Promise.all(open.slice(0, 20).map(async (r) => [r.id, await listReplacementCandidates(r.id)] as const)));
  const employees = directory.entries.filter((e) => e.has_record).map((e) => ({ id: e.employee_id, label: `${e.full_name} (${e.matricule})` }));
  return <AppShell role="team_manager"><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace équipe" title="Planning" icon={CalendarRange} description="Affectations par site et équipe, et remplacements à organiser pendant les absences approuvées.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={MapPin} label="Actives" value={assignments.entries.filter((a) => a.status === "ACTIVE").length} />
        <HeaderStat icon={CalendarRange} label="Planifiées" value={assignments.entries.filter((a) => a.status === "PLANNED").length} />
        <HeaderStat icon={ArrowRightLeft} label="À pourvoir" value={open.length} />
      </div>
    </PageHeader>
    <PlanningSection id="replacements" icon={ArrowRightLeft} title="Remplacements" description="Seuls les collaborateurs actifs, sous contrat, sans absence ni autre remplacement sur la période sont proposés.">
      <ReplacementBoard entries={replacements.entries} candidates={candidates} confirmAction={confirm} cancelAction={cancel} />
    </PlanningSection>
    <PlanningSection id="assignments" title="Affectations" description="Une affectation doit être comprise dans le contrat ; deux affectations en cours d’un même collaborateur ne peuvent pas se chevaucher.">
      <AssignmentBoard entries={assignments.entries} employees={employees} referential={sites} saveAction={save} />
    </PlanningSection>
  </div></AppShell>;
}
