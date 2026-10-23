import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
import { EmployeeImportReview } from "@/components/employees/EmployeeImportReview";
import { getEmployeeImport } from "@/lib/employees/import-service";
import { AUTH_REQUIRED_ERROR_MESSAGE } from "@/lib/admin/permissions";
export const dynamic = "force-dynamic";
export default async function EmployeeImportPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params; if (!z.uuid().safeParse(importId).success) notFound();
  let report;
  try { report = await getEmployeeImport(importId); }
  catch (error) { if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login"); return <AccessDenied context="Imports salariés" />; }
  return <AppShell role="agency_manager"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6"><PageHeader title="Revue de l’import salariés" eyebrow="Création uniquement" icon={FileSpreadsheet} description="Créations atomiques sur les lignes retenues, sans invitation ni fiche de paie." /><Link href="/manager/employees/imports" className="underline">Retour aux imports salariés</Link><Panel title={report?.status === "COMMITTED" ? "Rapport de création" : "Prévisualisation"}>{report ? <EmployeeImportReview key={report.fingerprint + report.status} report={report} /> : <p>Import introuvable ou expiré. Rechargez le fichier pour produire une nouvelle prévisualisation.</p>}</Panel></div></AppShell>;
}
