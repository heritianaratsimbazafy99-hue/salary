import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  LifeBuoy,
  LogOut,
  Mail,
  MailCheck,
  Printer,
  Rocket,
  Shuffle,
  Upload,
  Wallet,
  Repeat,
} from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Callout, IconTile, Panel } from "@/components/ui/Surface";
import type { Tone } from "@/components/ui/tones";
import { getCurrentActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { AccessDenied } from "@/components/shell/AccessDenied";

export const dynamic = "force-dynamic";

const ACTIVATION_STEPS: Array<{ icon: LucideIcon; tone: Tone; text: string }> = [
  { icon: Mail, tone: "teal", text: "Ouvrez l’invitation reçue et saisissez exactement l’adresse email invitée." },
  { icon: MailCheck, tone: "accent", text: "Demandez votre lien d’activation, puis ouvrez le second email dans le même navigateur. Le lien de confirmation est valable 15 minutes." },
  { icon: KeyRound, tone: "primary", text: "Pour vos prochaines connexions, utilisez « Recevoir mon lien de connexion »." },
];

const PAYROLL_STEPS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: FileSpreadsheet, text: "Remplissez la feuille « payroll » : une ligne par salarié et une seule période par fichier. Gardez les en-têtes du modèle." },
  { icon: Wallet, text: "Utilisez un identifiant salarié stable, une adresse email exacte, des dates AAAA-MM-JJ et des montants numériques en Ariary. Le fichier peut contenir jusqu’à 2 000 lignes et peser au maximum 4 Mo." },
  { icon: Upload, text: "Importez le fichier dans l’agence concernée. Classez les colonnes supplémentaires, puis vérifiez les erreurs et toutes les pages de prévisualisation." },
  { icon: Rocket, text: "Corrigez les lignes avant publication et contrôlez les nouveaux destinataires. La publication rend les fiches accessibles et déclenche les emails." },
  { icon: Repeat, text: "Après publication, une correction passe par un nouvel import de la même période puis une nouvelle publication. L’ancienne version reste inchangée dans le journal interne jusqu’à sa suppression prévue." },
];

export default async function HelpPage() {
  let actor: Awaited<ReturnType<typeof getCurrentActor>>;
  try { actor = await getCurrentActor(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    return <AccessDenied context="Guide d’utilisation" />;
  }
  const managesPayroll = actor.role !== "employee";
  const toc = [
    { href: "#activer", label: "Activer mon espace", icon: KeyRound },
    { href: "#consulter", label: "Consulter mes fiches", icon: FileText },
    ...(managesPayroll ? [{ href: "#publier", label: "Publier une paie", icon: Rocket }] : []),
    { href: "#aide", label: "Obtenir de l’aide", icon: LifeBuoy },
  ];

  return (
    <AppShell role={actor.role}>
      <article className="flex flex-col gap-6 text-foreground sm:gap-8">
        <PageHeader eyebrow="MadajobPay" title="Guide d’utilisation" icon={BookOpen} description="Vos fiches internes, de leur publication à leur consultation.">
          <nav aria-label="Sommaire du guide" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {toc.map((item) => (
              <a
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-foreground/20"
                href={item.href}
                key={item.href}
              >
                <item.icon className="size-4 text-accent" aria-hidden="true" />
                {item.label}
              </a>
            ))}
          </nav>
        </PageHeader>

        <section id="activer" className="scroll-mt-24 grid gap-4" aria-labelledby="activer-title">
          <SectionTitle id="activer-title" icon={KeyRound} tone="teal" eyebrow="Étape 1">Activer votre espace et vous connecter</SectionTitle>
          <ol className="grid gap-3 md:grid-cols-3">
            {ACTIVATION_STEPS.map((step, index) => (
              <li className="relative flex gap-4 overflow-hidden rounded-3xl border border-border/80 bg-surface p-5 shadow-[var(--shadow-sm)] md:block" key={step.text}>
                <span aria-hidden="true" className="absolute right-4 top-2 font-display text-5xl font-bold text-muted md:text-6xl">{index + 1}</span>
                <IconTile icon={step.icon} tone={step.tone} className="relative" />
                <p className="relative pr-8 text-sm leading-6 md:mt-4 md:pr-0">{step.text}</p>
              </li>
            ))}
          </ol>
          <Callout icon={AlertTriangle} tone="amber">
            Si aucun email n’arrive, vérifiez les indésirables et l’adresse saisie. Une invitation est valable 14 jours ; votre responsable peut la renvoyer. Un renvoi remplace l’ancien lien.
          </Callout>
        </section>

        <section id="consulter" className="scroll-mt-24 grid gap-4" aria-labelledby="consulter-title">
          <SectionTitle id="consulter-title" icon={FileText} tone="primary" eyebrow="Étape 2">Consulter et conserver une fiche</SectionTitle>
          <Panel>
            <p className="text-sm leading-6">Dans « Mes fiches », choisissez une période dans l’historique. Vous pouvez télécharger le PDF, imprimer la fiche ou exporter vos données en CSV.</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[{ icon: Download, label: "PDF", tone: "danger" as Tone }, { icon: Printer, label: "Imprimer", tone: "primary" as Tone }, { icon: FileSpreadsheet, label: "CSV", tone: "success" as Tone }].map((item) => (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-elevated p-4 text-center" key={item.label}>
                  <IconTile icon={item.icon} tone={item.tone} />
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-3 md:grid-cols-2">
            <Callout icon={CalendarClock} tone="teal">
              Les fiches restent disponibles pendant un an à compter de leur publication. Téléchargez les documents que vous souhaitez conserver avant leur expiration. Seule la dernière version publiée d’une période est visible.
            </Callout>
            <Callout icon={LogOut} tone="primary">
              Après utilisation, choisissez « Se déconnecter », surtout sur un appareil partagé. Ne transférez jamais un lien de connexion à une autre personne.
            </Callout>
          </div>
        </section>

        {managesPayroll ? (
          <section id="publier" className="scroll-mt-24 grid gap-4" aria-labelledby="publier-title">
            <SectionTitle id="publier-title" icon={Rocket} tone="accent" eyebrow="Managers & RH">Préparer et publier une paie</SectionTitle>
            <Panel>
              <div className="flex flex-col gap-4 rounded-2xl bg-success/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <IconTile icon={FileSpreadsheet} tone="success" />
                  <p className="text-sm font-medium">Partez toujours du modèle officiel.</p>
                </div>
                <Link className={buttonClasses({ variant: "primary" })} href="/api/payroll-template" prefetch={false}>
                  <Download className="size-4" aria-hidden="true" />
                  Télécharger le modèle Excel
                </Link>
              </div>
              <ol className="relative mt-6 grid gap-5 pl-14 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-0.5 before:bg-gradient-to-b before:from-teal before:via-primary before:to-accent">
                {PAYROLL_STEPS.map((step, index) => (
                  <li className="relative" key={step.text}>
                    <span className="absolute -left-14 top-0 flex size-10 items-center justify-center rounded-full border-4 border-surface bg-primary text-primary-foreground shadow-[var(--shadow-sm)]">
                      <step.icon className="size-4" aria-hidden="true" />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Étape {index + 1}</p>
                    <p className="mt-1 text-sm leading-6">{step.text}</p>
                  </li>
                ))}
              </ol>
            </Panel>
            <Callout icon={Shuffle} tone="amber">
              Les lignes invalides ne sont pas publiées. Ne publiez pas un lot tant que les montants et les adresses n’ont pas été validés par votre processus RH.
            </Callout>
          </section>
        ) : null}

        <section id="aide" className="scroll-mt-24 grid gap-4" aria-labelledby="aide-title">
          <SectionTitle id="aide-title" icon={LifeBuoy} tone="amber" eyebrow="Support">Obtenir de l’aide</SectionTitle>
          <div className="brand-gradient grid gap-5 rounded-3xl p-6 text-primary-foreground shadow-[var(--shadow-md)] md:grid-cols-[1fr_auto] md:items-center">
            <p className="text-sm leading-6 text-primary-foreground/85">Pour une adresse erronée, un accès bloqué ou une fiche à corriger, contactez <a className="font-semibold text-primary-foreground underline decoration-accent decoration-2 underline-offset-4" href="mailto:heritiana.ratsimbazafy99@gmail.com">heritiana.ratsimbazafy99@gmail.com</a>. Indiquez votre agence, la période et le message d’erreur, sans envoyer de lien de connexion ni de copie complète de vos données de paie.</p>
            <a className={buttonClasses({ variant: "accent" })} href="mailto:heritiana.ratsimbazafy99@gmail.com">
              <Mail className="size-4" aria-hidden="true" />
              Écrire au support
            </a>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Cette plateforme diffuse des fiches internes à partir de données de paie déjà validées. Elle ne calcule pas les obligations réglementaires de paie.</p>
        </section>
      </article>
    </AppShell>
  );
}

function SectionTitle({ id, icon, tone, eyebrow, children }: { id: string; icon: LucideIcon; tone: Tone; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={icon} tone={tone} />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h2 className="font-display text-xl font-semibold" id={id}>{children}</h2>
      </div>
    </div>
  );
}
