import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { ExportPanel } from "@/components/exports/ExportPanel";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import { listAgencies } from "@/lib/admin/agencies";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function ExportsPage() {
  let actor;
  try {
    actor = await requireCanReadPayrollAnalytics();
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Administration RH" />;
    throw error;
  }
  const agencies = await listAgencies();
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8"><PageHeader eyebrow="Administration RH" title="Exports" icon={Download} description="Téléchargez les rapports d’import et les fiches publiées par agence et période." /><ExportPanel agencies={agencies.map(({ id, name }) => ({ id, name }))} /></div></AppShell>;
}
