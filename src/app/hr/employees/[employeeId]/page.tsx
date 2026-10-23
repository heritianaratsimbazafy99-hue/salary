import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarDays, CalendarPlus, Contact, FileText, FolderLock, Lock, Save, ShieldCheck, Wallet } from "lucide-react";
import { DocumentList } from "@/components/hr/DocumentList";
import { DocumentUploadForm } from "@/components/hr/DocumentUploadForm";
import { EmployeeRecordFields, recordInput } from "@/components/hr/EmployeeRecordFields";
import { runCancellation, runDecision } from "@/components/hr/leave-actions";
import { LeaveCancelForm, LeaveDecisionForms, LeaveList } from "@/components/hr/LeaveList";
import { LeaveRequestFields, leaveInput } from "@/components/hr/LeaveRequestFields";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Callout, EmptyState, Panel } from "@/components/ui/Surface";
import { formatDay, formatMonthLong } from "@/components/ui/format";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { listEmployeeDocumentsForHr, withdrawDocument } from "@/lib/hr/documents";
import { getEmployeeFileForHr, listManagerOptions, savePrivateDetails, saveEmployeeRecord, updateCnaps } from "@/lib/hr/employees";
import { adjustLeaveBalance, createLeave, getLeaveBalances, listLeaves } from "@/lib/hr/leaves";
import { BALANCE_MOVEMENT_LABEL, CNAPS_STATUS_BADGE, CNAPS_STATUS_LABEL, EMPLOYEE_STATUS_BADGE, EMPLOYEE_STATUS_LABEL, HR_CNAPS_STATUSES } from "@/lib/hr/labels";
import { listHrReferential } from "@/lib/hr/referential";
export const dynamic = "force-dynamic";
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const revision = (form: FormData) => Number.parseInt(text(form, "revision"), 10) || null;
async function done(employeeId: string, task: () => Promise<void>, success: string): Promise<AdminFormResult> {
  try { await task(); } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath(`/hr/employees/${employeeId}`); revalidatePath("/hr/employees");
  return { success };
}
async function saveRecord(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => saveEmployeeRecord({ ...recordInput(form), employeeId, revision: revision(form) }), "Dossier enregistré.");
}
async function savePrivate(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => savePrivateDetails({ employeeId, revision: revision(form) ?? 0, personalEmail: text(form, "personalEmail"), personalPhone: text(form, "personalPhone"), postalAddress: text(form, "postalAddress"), emergencyContact: text(form, "emergencyContact") }), "Coordonnées enregistrées.");
}
async function saveCnaps(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => updateCnaps({ employeeId, revision: revision(form) ?? 0, cnapsNumber: text(form, "cnapsNumber"), cnapsStatus: text(form, "cnapsStatus") }), "Suivi CNAPS enregistré.");
}
async function withdraw(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => withdrawDocument({ documentId: text(form, "documentId"), reason: text(form, "reason") }), "Document retiré.");
}
async function adjustBalance(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => adjustLeaveBalance({ employeeId, kind: text(form, "kind"), days: text(form, "days"), reason: text(form, "reason"), revision: text(form, "revision") }), "Solde mis à jour.");
}
async function requestLeave(form: FormData): Promise<AdminFormResult> {
  "use server";
  const employeeId = text(form, "employeeId");
  return done(employeeId, () => createLeave(leaveInput(form)), "Demande enregistrée (en attente de décision).");
}
async function decideFromFile(form: FormData): Promise<AdminFormResult> {
  "use server";
  const result = await runDecision(form);
  revalidatePath("/hr/employees/[employeeId]", "page");
  return result;
}
async function cancelFromFile(form: FormData): Promise<AdminFormResult> {
  "use server";
  const result = await runCancellation(form);
  revalidatePath("/hr/employees/[employeeId]", "page");
  return result;
}
export default async function EmployeeFilePage({ params }: { params: Promise<{ employeeId: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Dossier collaborateur" />;
    throw error;
  }
  const { employeeId } = await params;
  const file = await getEmployeeFileForHr(employeeId);
  if (!file) notFound();
  const { identity, entry, privateDetails } = file;
  const [referential, managers, agencies, files, leaves, balances] = await Promise.all([listHrReferential(identity.agency_id), listManagerOptions(identity.agency_id), listAgencies(),
    listEmployeeDocumentsForHr(identity.id), listLeaves({ employeeId: identity.id }), getLeaveBalances([identity.id])]);
  const balance = balances.balances[0];
  const agencyName = agencies.find((a) => a.id === identity.agency_id)?.name ?? "Agence";
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <div><Link href={`/hr/employees?agencyId=${identity.agency_id}`} className={buttonClasses({ variant: "ghost", size: "sm" })}><ArrowLeft className="size-4" aria-hidden="true" />Collaborateurs</Link></div>
    <PageHeader eyebrow={agencyName} title={identity.full_name} icon={Contact} description={`Matricule ${identity.employee_id}${entry.job_title ? ` · ${entry.job_title}` : ""}`} />
    <Panel icon={BadgeCheck} tone="primary" title="Identité" titleId="identity" description="Le dossier salarié fait référence pour le nom. Les fiches conservent le nom de la source de paie. Les corrections d’email nécessitent une vérification RH."
      actions={<>
        {entry.status ? <StatusBadge status={EMPLOYEE_STATUS_BADGE[entry.status]} label={EMPLOYEE_STATUS_LABEL[entry.status]} /> : <StatusBadge status="WARNING" label="Dossier à compléter" />}
        <StatusBadge status={identity.is_active ? "ACTIVE" : "INACTIVE"} label={identity.is_active ? "Accès plateforme actif" : "Accès plateforme désactivé"} />
      </>}>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Matricule</dt><dd className="font-mono font-semibold">{identity.employee_id}</dd></div>
        <div><dt className="text-muted-foreground">Nom complet</dt><dd className="font-semibold">{identity.full_name}</dd></div>
        <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-muted-foreground">Email de connexion</dt><dd className="font-semibold">{identity.email}</dd></div>
      </dl>
    </Panel>
    <Panel icon={BriefcaseBusiness} tone="accent" title="Poste et contrat" titleId="record" description={entry.has_record ? "Visible des managers RH et des clients de son périmètre (sans données privées)." : "Ce salarié est connu par la paie mais n’a pas encore de dossier RH. Complétez-le ci-dessous."}>
      <AdminForm action={saveRecord} label="Poste et contrat" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="employeeId" value={identity.id} /><input type="hidden" name="revision" value={entry.revision ?? ""} />
        <EmployeeRecordFields prefix="record" referential={referential} managers={managers} entry={entry} />
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />{entry.has_record ? "Enregistrer" : "Créer le dossier"}</Button></div>
      </AdminForm>
    </Panel>
    {privateDetails ? <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <Panel icon={Lock} tone="teal" title="Coordonnées privées" titleId="private" description="Visibles uniquement par les RH et le salarié. Le journal d’audit enregistre les champs modifiés, jamais leur contenu.">
        <AdminForm action={savePrivate} label="Coordonnées privées" className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="employeeId" value={identity.id} /><input type="hidden" name="revision" value={privateDetails.revision} />
          <Input id="private-email" label="Email personnel" name="personalEmail" type="email" maxLength={254} defaultValue={privateDetails.personal_email ?? ""} />
          <Input id="private-phone" label="Téléphone" name="personalPhone" type="tel" maxLength={40} defaultValue={privateDetails.personal_phone ?? ""} />
          <Input id="private-address" label="Adresse" name="postalAddress" maxLength={500} defaultValue={privateDetails.postal_address ?? ""} />
          <Input id="private-emergency" label="Contact d’urgence" name="emergencyContact" maxLength={300} defaultValue={privateDetails.emergency_contact ?? ""} />
          <div className="sm:col-span-2"><Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
        </AdminForm>
      </Panel>
      <Panel icon={ShieldCheck} tone="amber" title="Suivi administratif CNAPS" titleId="cnaps" description="Suivi interne du dossier d’affiliation. Ce n’est pas une télé-déclaration auprès de la CNAPS.">
        <AdminForm action={saveCnaps} label="Suivi CNAPS" className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="employeeId" value={identity.id} /><input type="hidden" name="revision" value={privateDetails.revision} />
          <Input id="cnaps-number" label="Numéro CNAPS" name="cnapsNumber" maxLength={80} defaultValue={privateDetails.cnaps_number ?? ""} hint="Obligatoire pour le statut « Déclaré »." />
          <div className="grid min-w-0 gap-2"><label htmlFor="cnaps-status" className={labelClass}>Statut du dossier</label>
            <select id="cnaps-status" name="cnapsStatus" defaultValue={privateDetails.cnaps_status} className={fieldClass}>{HR_CNAPS_STATUSES.map((s) => <option key={s} value={s}>{CNAPS_STATUS_LABEL[s]}</option>)}</select></div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2"><StatusBadge status={CNAPS_STATUS_BADGE[privateDetails.cnaps_status]} label={`Actuellement : ${CNAPS_STATUS_LABEL[privateDetails.cnaps_status]}`} /><Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
        </AdminForm>
      </Panel>
    </div> : <Callout icon={Lock} tone="amber">Les coordonnées privées et le suivi CNAPS seront disponibles après la création du dossier RH.</Callout>}
    <Panel icon={CalendarDays} tone="accent" title="Congés et absences" titleId="leaves" description="Le module RH tient le solde ; chaque correction est motivée et historisée."
      actions={<span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-semibold"><Wallet className="size-4" aria-hidden="true" />Solde : {balance?.balance_days ?? 0} j</span>}>
      <div className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminForm action={adjustBalance} label="Corriger le solde" className="grid content-start gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
            <p className="font-semibold sm:col-span-2">Solde initial ou correction</p>
            <input type="hidden" name="employeeId" value={identity.id} /><input type="hidden" name="revision" value={balance?.revision ?? 1} />
            <div className="grid min-w-0 gap-2"><label htmlFor="balance-kind" className={labelClass}>Nature</label>
              <select id="balance-kind" name="kind" defaultValue={balance ? "ADJUSTMENT" : "INITIAL"} className={fieldClass}><option value="INITIAL">{BALANCE_MOVEMENT_LABEL.INITIAL}</option><option value="ADJUSTMENT">{BALANCE_MOVEMENT_LABEL.ADJUSTMENT}</option></select></div>
            <Input id="balance-days" label="Jours (+ ou −)" name="days" type="number" step={1} min={-366} max={366} required />
            <div className="sm:col-span-2"><Input id="balance-reason" label="Motif" name="reason" minLength={3} maxLength={2000} required placeholder="Ex. : reprise du solde au 1er octobre" /></div>
            <div className="sm:col-span-2"><Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
          </AdminForm>
          {entry.has_record ? <AdminForm action={requestLeave} label="Saisir une demande pour le salarié" resetOnSuccess className="grid content-start gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
            <p className="font-semibold sm:col-span-2">Saisir une demande pour le salarié</p>
            <input type="hidden" name="employeeId" value={identity.id} />
            <LeaveRequestFields prefix="hr-leave" />
            <div className="sm:col-span-2"><Button type="submit" variant="secondary"><CalendarPlus className="size-4" aria-hidden="true" />Enregistrer la demande</Button></div>
          </AdminForm> : <p className="text-sm text-muted-foreground">Créez le dossier RH pour saisir une demande.</p>}
        </div>
        <LeaveList entries={leaves.entries} showEmployee={false} emptyTitle="Aucune demande de congé." renderActions={(leave) => <>
          <LeaveDecisionForms entry={leave} action={decideFromFile} />
          {leave.status === "APPROVED" || leave.status === "PENDING" ? <LeaveCancelForm entry={leave} action={cancelFromFile} label={leave.status === "APPROVED" ? "Annuler ce congé (recrédit)" : "Annuler la demande"} /> : null}
        </>} />
        {balances.movements.length ? <details><summary className="cursor-pointer text-sm font-semibold">Historique du solde ({balances.movements.length})</summary>
          <ul className="mt-3 grid gap-2">{balances.movements.map((m) => <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <span><span className="font-semibold">{BALANCE_MOVEMENT_LABEL[m.kind]}</span> · {formatDay(m.created_at.slice(0, 10))}{m.reason ? ` — ${m.reason}` : ""}</span>
            <span className="tabular-nums">{m.days > 0 ? `+${m.days}` : m.days} j → {m.balance_after} j</span></li>)}</ul></details> : null}
      </div>
    </Panel>
    <Panel icon={FolderLock} tone="primary" title="Documents privés" titleId="documents" description="Contrats, pièces administratives et bulletins antérieurs à la plateforme. Visibles uniquement par les RH et le salarié ; jamais par les managers ou les clients.">
      <div className="grid gap-6">
        <DocumentUploadForm employeeId={identity.id} />
        {files.documents.length ? <DocumentList documents={files.documents} renderActions={(document) => document.status === "AVAILABLE" ? <details className="w-full sm:w-auto"><summary className="cursor-pointer text-sm font-semibold text-danger">Retirer</summary>
          <AdminForm action={withdraw} label={`Retirer ${document.title}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="employeeId" value={identity.id} /><input type="hidden" name="documentId" value={document.id} />
            <Input id={`withdraw-${document.id}`} label="Motif du retrait" name="reason" minLength={3} maxLength={500} required placeholder="Ex. : déposé sur le mauvais salarié" />
            <Button type="submit" size="sm" variant="danger">Confirmer le retrait</Button>
          </AdminForm></details> : null} /> : <EmptyState icon={FolderLock} headingLevel={3} title="Aucun document déposé." />}
      </div>
    </Panel>
    <Panel icon={FileText} tone="teal" title="Bulletins publiés" titleId="payslips" description="Issus du module de paie (source des montants). Le salarié les consulte et les télécharge dans « Mes fiches » ; ils ne sont pas dupliqués dans les documents.">
      {files.payslips.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{files.payslips.map((payslip) => <li key={payslip.id} className="rounded-2xl border border-border p-3 text-sm">
        <p className="font-semibold capitalize">{formatMonthLong(payslip.period_start)}</p>
        <p className="text-muted-foreground">Version {payslip.version_number ?? "—"} · publiée le {formatDay(payslip.published_at.slice(0, 10))}</p>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun bulletin publié pour ce salarié.</p>}
    </Panel>
  </div></AppShell>;
}
