import { redirect } from "next/navigation";
import Link from "next/link";
import { BriefcaseBusiness, CalendarRange, FileText, FolderLock, IdCard, Lock, ShieldCheck } from "lucide-react";
import { DocumentList } from "@/components/hr/DocumentList";
import { buttonClasses } from "@/components/ui/Button";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatDay } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, Panel } from "@/components/ui/Surface";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { listOwnDocuments } from "@/lib/hr/documents";
import { ASSIGNMENT_STATUS_BADGE, ASSIGNMENT_STATUS_LABEL, listAssignments } from "@/lib/hr/planning";
import { getOwnEmployeeFiles } from "@/lib/hr/employees";
import { CNAPS_STATUS_BADGE, CNAPS_STATUS_LABEL, CONTRACT_TYPE_LABEL, EMPLOYEE_STATUS_BADGE, EMPLOYEE_STATUS_LABEL } from "@/lib/hr/labels";
export const dynamic = "force-dynamic";
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value || "—"}</dd></div>;
}
export default async function EmployeeProfilePage() {
  let files: Awaited<ReturnType<typeof getOwnEmployeeFiles>>;
  let documents: Awaited<ReturnType<typeof listOwnDocuments>>;
  let assignments: Awaited<ReturnType<typeof listAssignments>>;
  try { [files, documents, assignments] = await Promise.all([getOwnEmployeeFiles(), listOwnDocuments(), listAssignments()]); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace salarié" />;
    throw error;
  }
  return <AppShell role="employee"><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace salarié" title="Mon dossier" icon={IdCard} description="Les informations de votre dossier RH. Pour toute correction, contactez le service RH." />
    {!files.length ? <EmptyState icon={IdCard} title="Aucun dossier disponible." description="Votre dossier RH n’a pas encore été créé." /> : null}
    {files.map(({ entry, privateDetails }) => <div key={entry.employee_id} className="grid min-w-0 gap-6">
      <Panel icon={BriefcaseBusiness} tone="accent" title={entry.job_title ?? "Poste non renseigné"} titleId={`job-${entry.employee_id}`} description={`Matricule ${entry.matricule}`}
        actions={entry.status ? <StatusBadge status={EMPLOYEE_STATUS_BADGE[entry.status]} label={EMPLOYEE_STATUS_LABEL[entry.status]} /> : null}>
        {entry.has_record ? <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Site" value={entry.site_name} /><Field label="Équipe" value={entry.team_name} /><Field label="Département" value={entry.department_name} />
          <Field label="Responsable" value={entry.manager_name} /><Field label="Contrat" value={entry.contract_type ? CONTRACT_TYPE_LABEL[entry.contract_type] : null} />
          <Field label="Période" value={entry.contract_start ? `${formatDay(entry.contract_start)}${entry.contract_end ? ` → ${formatDay(entry.contract_end)}` : " — sans date de fin"}` : null} />
        </dl> : <p className="text-sm text-muted-foreground">Votre dossier RH n’a pas encore été complété.</p>}
      </Panel>
      {privateDetails ? <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel icon={Lock} tone="teal" title="Coordonnées privées" titleId={`private-${entry.employee_id}`} description="Visibles uniquement par vous et le service RH.">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Email personnel" value={privateDetails.personal_email} /><Field label="Téléphone" value={privateDetails.personal_phone} />
            <Field label="Adresse" value={privateDetails.postal_address} /><Field label="Contact d’urgence" value={privateDetails.emergency_contact} />
          </dl>
        </Panel>
        <Panel icon={ShieldCheck} tone="amber" title="Suivi CNAPS" titleId={`cnaps-${entry.employee_id}`} description="Suivi administratif interne de votre affiliation."
          actions={<StatusBadge status={CNAPS_STATUS_BADGE[privateDetails.cnaps_status]} label={CNAPS_STATUS_LABEL[privateDetails.cnaps_status]} />}>
          <dl className="text-sm"><Field label="Numéro CNAPS" value={privateDetails.cnaps_number} /></dl>
        </Panel>
      </div> : null}
    </div>)}
    {assignments.entries.length ? <Panel icon={CalendarRange} tone="teal" title="Mes affectations" titleId="assignments">
      <ul className="grid gap-2">{assignments.entries.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
        <span><span className="font-semibold">{a.site_name}</span>{a.team_name ? ` · ${a.team_name}` : ""} · {formatDay(a.start_date)} → {a.end_date ? formatDay(a.end_date) : "sans date de fin"}</span>
        <StatusBadge status={ASSIGNMENT_STATUS_BADGE[a.status]} label={ASSIGNMENT_STATUS_LABEL[a.status]} /></li>)}</ul>
    </Panel> : null}
    <Panel icon={FolderLock} tone="primary" title="Mes documents" titleId="documents" description="Documents déposés par le service RH. Ils ne sont visibles que par vous et les RH."
      actions={<Link className={buttonClasses({ variant: "secondary", size: "sm" })} href="/employee/payslips"><FileText className="size-4" aria-hidden="true" />Mes bulletins de paie</Link>}>
      {documents.length ? <DocumentList documents={documents} /> : <p className="text-sm text-muted-foreground">Aucun document pour le moment. Vos bulletins publiés se trouvent dans « Mes fiches ».</p>}
    </Panel>
  </div></AppShell>;
}
