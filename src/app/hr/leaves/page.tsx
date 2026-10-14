import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarDays, Filter, Hourglass } from "lucide-react";
import { runCancellation, runDecision } from "@/components/hr/leave-actions";
import { LeaveCancelForm, LeaveDecisionForms, LeaveList } from "@/components/hr/LeaveList";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/Input";
import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { HR_LEAVE_STATUSES, LEAVE_STATUS_LABEL } from "@/lib/hr/labels";
import { listLeaves } from "@/lib/hr/leaves";
export const dynamic = "force-dynamic";
async function decide(form: FormData): Promise<AdminFormResult> {
  "use server";
  const result = await runDecision(form);
  revalidatePath("/hr/leaves");
  return result;
}
async function cancel(form: FormData): Promise<AdminFormResult> {
  "use server";
  const result = await runCancellation(form);
  revalidatePath("/hr/leaves");
  return result;
}
export default async function HrLeavesPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string; status?: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Congés" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const status = params.status === "all" ? undefined : (params.status ?? "PENDING");
  const [agencies, leaves, pending] = await Promise.all([listAgencies(), listLeaves({ agencyId: params.agencyId, status }), listLeaves({ agencyId: params.agencyId, status: "PENDING" })]);
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Ressources humaines" title="Congés et absences" icon={CalendarDays} description="Décisions, annulations motivées et historique. Le module RH tient les soldes ; la paie reste la source des montants.">
      <div className="grid grid-cols-2 gap-2 sm:gap-3"><HeaderStat icon={Hourglass} label="En attente" value={pending.count} /><HeaderStat icon={Filter} label="Affichées" value={leaves.count} /></div>
    </PageHeader>
    <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Filtrer les congés">
      <div className="grid min-w-0 gap-2"><label htmlFor="leaves-agency" className={labelClass}>Agence</label>
        <select id="leaves-agency" name="agencyId" defaultValue={params.agencyId ?? ""} className={fieldClass}><option value="">Toutes les agences</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div className="grid min-w-0 gap-2"><label htmlFor="leaves-status" className={labelClass}>Statut</label>
        <select id="leaves-status" name="status" defaultValue={params.status ?? "PENDING"} className={fieldClass}><option value="all">Tous</option>{HR_LEAVE_STATUSES.map((s) => <option key={s} value={s}>{LEAVE_STATUS_LABEL[s]}</option>)}</select></div>
      <Button type="submit" variant="secondary"><Filter className="size-4" aria-hidden="true" />Filtrer</Button>
    </form>
    <LeaveList entries={leaves.entries} emptyTitle="Aucune demande pour ces filtres." renderActions={(entry) => <>
      <LeaveDecisionForms entry={entry} action={decide} />
      {entry.status === "APPROVED" || entry.status === "PENDING" ? <LeaveCancelForm entry={entry} action={cancel} label={entry.status === "APPROVED" ? "Annuler ce congé (recrédit)" : "Annuler la demande"} /> : null}
    </>} />
  </div></AppShell>;
}
