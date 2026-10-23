import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { EmployeeImportUpload } from "@/components/employees/EmployeeImportUpload";
import { listEmployeeImports } from "@/lib/employees/import-service";
import { AUTH_REQUIRED_ERROR_MESSAGE } from "@/lib/admin/permissions";
export const dynamic = "force-dynamic";
export default async function EmployeeImportsPage() {
  let reports;
  try { reports = await listEmployeeImports(); }
  catch (error) { if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login"); return <AccessDenied context="Imports salariés" />; }
  return <AppShell role="agency_manager"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
    <PageHeader title="Imports salariés" eyebrow="Effectif de l’agence" icon={FileSpreadsheet} description="Créez les dossiers salariés indépendamment de la paie." actions={<Link href="/api/manager/employee-imports/template" prefetch={false} className={buttonClasses({ variant: "secondary" })}>Télécharger le modèle XLSX</Link>} />
    <Link href="/manager/employees" className="underline">Retour aux salariés</Link>
    <Panel title="Nouvel import"><EmployeeImportUpload /></Panel>
    <Panel title="Rapports des 30 derniers jours">{reports.length ? <ul className="grid gap-3">{reports.map(report => <li key={report.id}><Link className="underline" href={`/manager/employees/imports/${report.id}`}>Import du {new Date(report.created_at).toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" })} — {report.status === "COMMITTED" ? `${report.created_count} création(s)` : report.status === "READY" ? "Prêt à confirmer" : "À revoir"}</Link></li>)}</ul> : <p>Aucun rapport disponible.</p>}</Panel>
  </div></AppShell>;
}
