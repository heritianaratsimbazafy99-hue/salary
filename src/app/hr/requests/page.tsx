import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Filter, MessageSquareReply, MessageSquareText } from "lucide-react";
import { RequestList } from "@/components/hr/RequestList";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/Input";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { HR_REQUEST_STATUSES, REQUEST_STATUS_LABEL, listRequests, replyRequest } from "@/lib/hr/requests";
export const dynamic = "force-dynamic";
async function reply(form: FormData): Promise<AdminFormResult> {
  "use server";
  const text = (name: string) => String(form.get(name) ?? "");
  try { await replyRequest({ requestId: text("requestId"), reply: text("reply"), status: text("status"), revision: text("revision") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Réponse impossible." }; }
  revalidatePath("/hr/requests");
  return { success: "Réponse enregistrée ; le salarié la voit dans son espace." };
}
export default async function HrRequestsPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string; status?: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Demandes RH" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const status = params.status === "all" ? undefined : params.status;
  const [agencies, requests, all] = await Promise.all([listAgencies(), listRequests({ agencyId: params.agencyId, status }), listRequests({ agencyId: params.agencyId })]);
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Ressources humaines" title="Demandes RH" icon={MessageSquareText} description="Questions des collaborateurs : répondez et suivez chaque demande jusqu’à sa résolution.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={MessageSquareText} label="Ouvertes" value={all.filter((r) => r.status === "OPEN").length} />
        <HeaderStat icon={MessageSquareReply} label="En cours" value={all.filter((r) => r.status === "IN_PROGRESS").length} />
        <HeaderStat icon={Filter} label="Affichées" value={requests.length} />
      </div>
    </PageHeader>
    <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Filtrer les demandes">
      <div className="grid min-w-0 gap-2"><label htmlFor="requests-agency" className={labelClass}>Agence</label>
        <select id="requests-agency" name="agencyId" defaultValue={params.agencyId ?? ""} className={fieldClass}><option value="">Toutes les agences</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div className="grid min-w-0 gap-2"><label htmlFor="requests-status" className={labelClass}>Statut</label>
        <select id="requests-status" name="status" defaultValue={params.status ?? "all"} className={fieldClass}><option value="all">Tous</option>{HR_REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}</select></div>
      <Button type="submit" variant="secondary"><Filter className="size-4" aria-hidden="true" />Filtrer</Button>
    </form>
    <RequestList requests={requests} showEmployee emptyTitle="Aucune demande pour ces filtres." renderActions={(request) => request.status === "RESOLVED" ? null :
      <details className="border-t border-border pt-3" open={request.status === "OPEN"}><summary className="cursor-pointer text-sm font-semibold">Répondre</summary>
        <AdminForm action={reply} label={`Répondre à ${request.subject}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-end">
          <input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="revision" value={request.revision} />
          <div className="grid min-w-0 gap-2"><label htmlFor={`reply-${request.id}`} className={labelClass}>Réponse</label>
            <textarea id={`reply-${request.id}`} name="reply" defaultValue={request.reply ?? ""} maxLength={4000} required rows={3} className={`${fieldClass} min-h-24 py-3`} /></div>
          <div className="grid min-w-0 gap-2"><label htmlFor={`reply-status-${request.id}`} className={labelClass}>Statut</label>
            <select id={`reply-status-${request.id}`} name="status" defaultValue="RESOLVED" className={fieldClass}><option value="IN_PROGRESS">En cours</option><option value="RESOLVED">Résolue</option></select></div>
          <div className="sm:col-span-2"><Button type="submit" size="sm"><MessageSquareReply className="size-4" aria-hidden="true" />Enregistrer la réponse</Button></div>
        </AdminForm></details>} />
  </div></AppShell>;
}
