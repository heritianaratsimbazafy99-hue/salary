import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarPlus, History, Wallet } from "lucide-react";
import { LeaveCancelForm, LeaveList } from "@/components/hr/LeaveList";
import { LeaveRequestFields, leaveInput } from "@/components/hr/LeaveRequestFields";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { formatDay } from "@/components/ui/format";
import { fieldClass, labelClass } from "@/components/ui/Input";
import { EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { getOwnEmployeeFiles } from "@/lib/hr/employees";
import { BALANCE_MOVEMENT_LABEL } from "@/lib/hr/labels";
import { cancelLeave, createLeave, getLeaveBalances, listLeaves } from "@/lib/hr/leaves";
export const dynamic = "force-dynamic";
async function request(form: FormData): Promise<AdminFormResult> {
  "use server";
  try { await createLeave(leaveInput(form)); } catch (error) { return { error: error instanceof Error ? error.message : "Demande impossible." }; }
  revalidatePath("/employee/leaves");
  return { success: "Demande envoyée. Vous serez informé de la décision dans cette page." };
}
async function cancel(form: FormData): Promise<AdminFormResult> {
  "use server";
  try { await cancelLeave({ leaveId: String(form.get("leaveId") ?? ""), reason: String(form.get("reason") ?? ""), revision: String(form.get("revision") ?? "") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Annulation impossible." }; }
  revalidatePath("/employee/leaves");
  return { success: "Demande annulée." };
}
export default async function EmployeeLeavesPage() {
  let files: Awaited<ReturnType<typeof getOwnEmployeeFiles>>;
  try { files = await getOwnEmployeeFiles(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace salarié" />;
    throw error;
  }
  const employments = files.map((file) => file.entry).filter((entry) => entry.has_record);
  const [{ entries }, { balances, movements }] = await Promise.all([listLeaves(), getLeaveBalances(employments.map((e) => e.employee_id))]);
  const totalBalance = balances.reduce((sum, balance) => sum + balance.balance_days, 0);
  const pending = entries.filter((entry) => entry.status === "PENDING").length;
  return <AppShell role="employee"><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace salarié" title="Mes congés" icon={CalendarDays} description="Demandez un congé ou une absence et suivez les décisions. Le solde est tenu par le service RH.">
      <div className="grid grid-cols-2 gap-2 sm:gap-3"><HeaderStat icon={Wallet} label="Solde congés payés" value={`${totalBalance} j`} /><HeaderStat icon={CalendarDays} label="En attente" value={pending} /></div>
    </PageHeader>
    {employments.length ? <Panel icon={CalendarPlus} tone="accent" title="Nouvelle demande" titleId="new-leave">
      <AdminForm action={request} label="Nouvelle demande de congé" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        {employments.length > 1 ? <div className="grid min-w-0 gap-2 sm:col-span-2"><label htmlFor="leave-employment" className={labelClass}>Emploi concerné</label>
          <select id="leave-employment" name="employeeId" className={fieldClass}>{employments.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.job_title} — {e.site_name}</option>)}</select></div>
          : <input type="hidden" name="employeeId" value={employments[0].employee_id} />}
        <LeaveRequestFields prefix="leave" />
        <div className="sm:col-span-2"><Button type="submit"><CalendarPlus className="size-4" aria-hidden="true" />Envoyer la demande</Button></div>
      </AdminForm>
    </Panel> : <EmptyState icon={CalendarDays} title="Votre dossier RH n’est pas encore créé." description="Contactez le service RH pour pouvoir déposer une demande." />}
    <section aria-labelledby="my-leaves" className="grid min-w-0 gap-4">
      <h2 id="my-leaves" className="font-display text-lg font-semibold">Mes demandes</h2>
      <LeaveList entries={entries} showEmployee={false} emptyTitle="Aucune demande pour le moment." renderActions={(entry) => entry.status === "PENDING" ? <LeaveCancelForm entry={entry} action={cancel} label="Annuler ma demande" /> : null} />
    </section>
    <Panel icon={History} tone="teal" title="Historique du solde" titleId="balance-history" description="Solde initial, corrections motivées par les RH, congés approuvés et recrédits.">
      {movements.length ? <ul className="grid gap-2">{movements.map((m) => <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
        <span><span className="font-semibold">{BALANCE_MOVEMENT_LABEL[m.kind]}</span> · {formatDay(m.created_at.slice(0, 10))}{m.reason ? ` — ${m.reason}` : ""}</span>
        <span className="tabular-nums"><span className={m.days > 0 ? "text-success" : "text-danger"}>{m.days > 0 ? `+${m.days}` : m.days} j</span> → {m.balance_after} j</span>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun mouvement.</p>}
    </Panel>
  </div></AppShell>;
}
