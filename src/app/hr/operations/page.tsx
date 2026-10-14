import { redirect } from "next/navigation";
import { Activity, BellRing, CheckCircle2, Clock, Mail, Radar, Send, ShieldCheck, Zap } from "lucide-react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
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
      <div className="flex flex-col gap-6 sm:gap-8">
        <PageHeader eyebrow="Administration" title="Opérations" icon={Activity} description="Vérifiez le fonctionnement de la supervision de la plateforme." />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Panel icon={BellRing} tone="amber" title="Test des alertes" titleId="monitoring-title" description="Envoyez une erreur de test à Sentry pour vérifier sa réception et l’alerte par e-mail. Ce test ne contient aucune donnée de paie.">
            <div className="grid gap-5">
              <ol className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Send, title: "Envoi", text: "Une erreur fictive part vers Sentry." },
                  { icon: Radar, title: "Détection", text: "Sentry crée un incident." },
                  { icon: Mail, title: "Alerte", text: "Un e-mail arrive au propriétaire." },
                ].map((step, index) => (
                  <li className="rounded-2xl border border-border bg-surface-elevated p-4" key={step.title}>
                    <span className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><step.icon className="size-4" aria-hidden="true" /></span>
                      <span className="font-display text-xs font-bold text-muted-foreground">0{index + 1}</span>
                    </span>
                    <p className="mt-3 text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.text}</p>
                  </li>
                ))}
              </ol>
              <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground"><Clock className="mt-1 size-4 shrink-0" aria-hidden="true" />Chaque tentative est inscrite au journal d’audit. Un délai de quinze minutes s’applique entre deux tests.</p>
              <AdminForm action={sendMonitoringSmoke} label="Test de supervision" className="space-y-3">
                <Button size="lg" type="submit"><Zap className="size-4" aria-hidden="true" />Envoyer un test Sentry</Button>
              </AdminForm>
            </div>
          </Panel>
          <Panel icon={ShieldCheck} tone="success" title="Bonnes pratiques" description="À faire après chaque changement de configuration.">
            <ul className="grid gap-3 text-sm">
              {["Lancez un test et vérifiez la réception de l’e-mail d’alerte.", "Contrôlez que l’incident n’expose aucune donnée personnelle.", "Résolvez l’incident de test dans Sentry une fois vérifié."].map((item) => (
                <li className="flex items-start gap-2.5" key={item}><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span className="text-muted-foreground">{item}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
