import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MessageSquarePlus, MessageSquareText, Send } from "lucide-react";
import { RequestList } from "@/components/hr/RequestList";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { getOwnEmployeeFiles } from "@/lib/hr/employees";
import { HR_REQUEST_CATEGORIES, REQUEST_CATEGORY_LABEL, createRequest, listRequests } from "@/lib/hr/requests";
export const dynamic = "force-dynamic";
async function send(form: FormData): Promise<AdminFormResult> {
  "use server";
  const text = (name: string) => String(form.get(name) ?? "");
  try { await createRequest({ employeeId: text("employeeId"), category: text("category"), subject: text("subject"), message: text("message") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Envoi impossible." }; }
  revalidatePath("/employee/requests");
  return { success: "Demande envoyée au service RH." };
}
export default async function EmployeeRequestsPage() {
  let files: Awaited<ReturnType<typeof getOwnEmployeeFiles>>;
  try { files = await getOwnEmployeeFiles(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace salarié" />;
    throw error;
  }
  const requests = await listRequests();
  const employments = files.map((file) => file.entry);
  return <AppShell role="employee"><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace salarié" title="Mes demandes RH" icon={MessageSquareText} description="Posez une question au service RH (contrat, paie, congés, démarches) et suivez sa réponse.">
      <div className="grid grid-cols-2 gap-2 sm:gap-3"><HeaderStat icon={MessageSquareText} label="En cours" value={requests.filter((r) => r.status !== "RESOLVED").length} /><HeaderStat icon={Send} label="Résolues" value={requests.filter((r) => r.status === "RESOLVED").length} /></div>
    </PageHeader>
    {employments.length ? <Panel icon={MessageSquarePlus} tone="accent" title="Nouvelle demande" titleId="new-request" description="Votre demande n’est visible que par vous et le service RH.">
      <AdminForm action={send} label="Nouvelle demande RH" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        {employments.length > 1 ? <div className="grid min-w-0 gap-2 sm:col-span-2"><label htmlFor="request-employment" className={labelClass}>Emploi concerné</label>
          <select id="request-employment" name="employeeId" className={fieldClass}>{employments.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.job_title ?? e.matricule}{e.site_name ? ` — ${e.site_name}` : ""}</option>)}</select></div>
          : <input type="hidden" name="employeeId" value={employments[0].employee_id} />}
        <div className="grid min-w-0 gap-2"><label htmlFor="request-category" className={labelClass}>Catégorie</label>
          <select id="request-category" name="category" className={fieldClass}>{HR_REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{REQUEST_CATEGORY_LABEL[c]}</option>)}</select></div>
        <Input id="request-subject" label="Sujet" name="subject" maxLength={200} required placeholder="Ex. : attestation de salaire" />
        <div className="grid min-w-0 gap-2 sm:col-span-2"><label htmlFor="request-message" className={labelClass}>Message</label>
          <textarea id="request-message" name="message" maxLength={4000} required rows={4} className={`${fieldClass} min-h-28 py-3`} /></div>
        <div className="sm:col-span-2"><Button type="submit"><Send className="size-4" aria-hidden="true" />Envoyer</Button></div>
      </AdminForm>
    </Panel> : <EmptyState icon={MessageSquareText} title="Aucun emploi actif." description="Votre accès salarié doit être actif pour envoyer une demande." />}
    <section aria-labelledby="my-requests" className="grid gap-4"><h2 id="my-requests" className="font-display text-lg font-semibold">Mes demandes</h2>
      <RequestList requests={requests} emptyTitle="Aucune demande pour le moment." /></section>
  </div></AppShell>;
}
