import Link from "next/link";
import { reconcileEmailChange, requestUnlinkedEmailVerification } from "@/lib/employees/identity-change";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { decideAgencyEmployeeChange, listAgencyChangeRequests } from "@/lib/employees/agency-management";
export const dynamic = "force-dynamic";
const kinds: Record<string, string> = { RETURN: "Retour dans l’effectif", EMAIL: "Email de connexion", MATRICULE: "Matricule", MANAGER: "Manager RH" };
const statuses: Record<string, string> = { PENDING: "En attente", REJECTED: "Refusée", EXECUTED: "Réalisée", APPROVED_PENDING_VERIFICATION: "Acceptée — adresse à vérifier", APPROVED: "Acceptée", CANCELLED: "Annulée" };
const feedbackMessages: Record<string, string> = { decision: "Décision enregistrée. Un email accepté attend encore la vérification de la nouvelle adresse.", sent: "Vérification envoyée. Le changement attend la confirmation du destinataire.", executed: "Nouvelle adresse vérifiée et changement réalisé.", cancelled: "Vérification annulée. L’ancienne adresse reste effective." };
async function decide(form: FormData): Promise<AdminFormResult> {
  "use server";
  try { await decideAgencyEmployeeChange({ requestId: String(form.get("requestId") ?? ""), revision: Number(form.get("revision")), decision: String(form.get("decision") ?? ""), reason: String(form.get("reason") ?? "") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Décision impossible." }; }
  revalidatePath("/hr/agency-requests"); revalidatePath("/manager/employees", "layout");
  redirect("/hr/agency-requests?feedback=decision");
}
async function sendVerification(form: FormData): Promise<AdminFormResult> {
  "use server";
  try { await requestUnlinkedEmailVerification(String(form.get("requestId") ?? "")); }
  catch (error) { return { error: error instanceof Error ? error.message : "Envoi impossible." }; }
  revalidatePath("/hr/agency-requests"); redirect("/hr/agency-requests?status=APPROVED_PENDING_VERIFICATION&feedback=sent");
}
async function reconcileVerification(form: FormData): Promise<AdminFormResult> {
  "use server";
  let result: "EXECUTED" | "CANCELLED";
  try { result = await reconcileEmailChange(String(form.get("requestId") ?? "")); }
  catch (error) { return { error: error instanceof Error ? error.message : "Réconciliation impossible." }; }
  revalidatePath("/hr/agency-requests"); revalidatePath("/manager/employees", "layout");
  redirect(`/hr/agency-requests?status=${result}&feedback=${result === "EXECUTED" ? "executed" : "cancelled"}`);
}
export default async function AgencyRequestsPage({ searchParams }: { searchParams?: Promise<{ status?: string; feedback?: string }> }) {
  let actor;
  try { actor = await requireCanManageHrReferential(); } catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Demandes des agences" />;
    throw error;
  }
  const params = await searchParams ?? {}; const all = await listAgencyChangeRequests(); const filter = params.status ?? "PENDING"; const requests = all.filter((request) => !filter || request.status === filter);
  return <AppShell role={actor.role}><div className="grid gap-6"><PageHeader title="Demandes des agences" eyebrow="Ressources humaines" icon={UsersRound} description="Examinez les retours, corrections d’identité et changements de Manager RH. Chaque décision vérifie les révisions et l’éligibilité sans modifier les droits d’accès." />
  {params.feedback && feedbackMessages[params.feedback] ? <p role="status" className="rounded-xl border border-success/25 bg-success/5 p-4 text-sm text-success">{feedbackMessages[params.feedback]}</p> : null}
  <form className="flex flex-wrap items-end gap-3" aria-label="Filtrer les demandes des agences"><div className="grid gap-2"><label htmlFor="request-status" className={labelClass}>État</label><select id="request-status" name="status" className={fieldClass} defaultValue={filter}><option value="">Tous les états</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><Button type="submit" variant="secondary">Filtrer</Button></form>
  {requests.length ? requests.map((request) => <Panel key={`${request.id}-${request.revision}`} title={`${kinds[request.kind]} — ${statuses[request.status] ?? request.status}`} description={`${request.employee_name} · ${request.matricule} · ${request.agency_name} — demande de ${request.created_by_name}, le ${new Date(request.created_at).toLocaleDateString("fr-MG")}`}><Link className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" href={`/hr/employees/${request.employee_id}`}>Ouvrir le dossier RH de {request.employee_name}</Link><dl className="grid gap-2 text-sm"><div><dt className="font-semibold">Valeur actuelle</dt><dd className="break-all">{request.kind === "RETURN" ? (request.current_value === "DEPARTED" ? "Salarié archivé après départ" : request.current_value === "CURRENT" ? "Dans l’effectif actuel" : "Situation à revoir") : request.current_value || "Non renseignée"}</dd></div><div><dt className="font-semibold">Valeur demandée</dt><dd className="break-all">{request.requested_display_value || request.requested_value || "Sans Manager RH"}</dd></div><div><dt className="font-semibold">Motif de la demande</dt><dd className="break-words">{request.reason}</dd></div>{request.kind === "RETURN" ? <div><dt className="font-semibold">Contexte du retour</dt><dd>Départ : {request.departed_on ?? "Non renseigné"} · Contrat : {request.contract_type ?? "À compléter"} · {request.contract_start ?? "Début non renseigné"} / {request.contract_end ?? "Sans date de fin"}. Le retour conserve le même dossier ; l’accès reste une décision distincte.</dd></div> : null}{request.decision_reason ? <div><dt className="font-semibold">Réponse RH</dt><dd>{request.decision_reason}</dd></div> : null}</dl>
    {request.kind === "EMAIL" && request.status === "APPROVED_PENDING_VERIFICATION" ? <div className="mt-4 grid gap-3"><p className="text-sm text-muted-foreground">Si un compte est déjà lié, le salarié doit ouvrir <Link className="font-semibold text-primary underline" href="/employee/email-change">la vérification de son adresse depuis son espace</Link>. Pour un emploi sans compte, envoyez la vérification à la nouvelle adresse.</p><AdminForm action={sendVerification} label={`Vérifier l’email ${request.id}`}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="secondary">Envoyer la vérification</Button></AdminForm><AdminForm action={reconcileVerification} label={`Réconcilier l’email ${request.id}`}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="secondary">Réconcilier / annuler</Button></AdminForm></div> : null}
    {request.status === "PENDING" ? <AdminForm action={decide} label={`Décider la demande ${request.id}`} className="mt-5 grid gap-4 sm:grid-cols-2"><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="revision" value={request.revision} /><div className="grid gap-2"><label className={labelClass} htmlFor={`decision-${request.id}`}>Décision</label><select id={`decision-${request.id}`} className={fieldClass} name="decision" required defaultValue=""><option value="" disabled>Choisir une décision</option><option value="APPROVE">Accepter</option><option value="REJECT">Refuser</option></select></div><Input id={`reason-${request.id}`} name="reason" label="Motif de la décision" minLength={3} maxLength={300} required /><div><Button type="submit">Enregistrer la décision</Button></div></AdminForm> : null}
  </Panel>) : <Panel><p className="text-sm text-muted-foreground">Aucune demande dans cet état.</p></Panel>}</div></AppShell>;
}
