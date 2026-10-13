import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { AdminForm } from "@/lib/admin/AdminForm";
import { getCurrentActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { sendMonitoringSmoke } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  let actor;
  try {
    actor = await getCurrentActor();
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Opérations" />;
    throw error;
  }
  if (actor.role !== "super_admin") return <AccessDenied context="Opérations" />;

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Administration" title="Opérations" description="Vérifiez le fonctionnement de la supervision de la plateforme." />
        <section className="rounded-2xl border border-border bg-surface p-6 space-y-4" aria-labelledby="monitoring-title">
          <h2 className="text-lg font-semibold" id="monitoring-title">Test des alertes</h2>
          <p className="text-sm text-muted-foreground">Envoyez une erreur de test à Sentry pour vérifier sa réception et l’alerte par e-mail. Ce test ne contient aucune donnée de paie.</p>
          <p className="text-sm text-muted-foreground">Chaque tentative est inscrite au journal d’audit. Un délai de quinze minutes s’applique entre deux tests.</p>
          <AdminForm action={sendMonitoringSmoke} label="Test de supervision" className="space-y-3">
            <Button type="submit">Envoyer un test Sentry</Button>
          </AdminForm>
        </section>
      </div>
    </AppShell>
  );
}
