import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Building2,
  Clock,
  Download,
  Eye,
  FileText,
  Fingerprint,
  History,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { HeroShowcase } from "@/components/marketing/HeroShowcase";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Reveal } from "@/components/marketing/Reveal";

type Tint = "teal" | "accent" | "amber" | "primary";

const tintTile: Record<Tint, string> = {
  teal: "bg-teal/12 text-teal",
  accent: "bg-accent/15 text-accent-foreground",
  amber: "bg-amber/15 text-amber-foreground",
  primary: "bg-primary/10 text-primary",
};

const tintNode: Record<Tint, string> = {
  teal: "bg-teal text-teal-foreground",
  accent: "bg-accent text-accent-foreground",
  amber: "bg-amber text-amber-foreground",
  primary: "bg-primary text-primary-foreground",
};

const STEPS: Array<{ title: string; description: string; icon: LucideIcon; tint: Tint }> = [
  {
    title: "Recevez votre accès",
    description: "Votre employeur vous invite avec votre adresse professionnelle. Rien à installer.",
    icon: Mail,
    tint: "teal",
  },
  {
    title: "Connectez-vous",
    description: "Un lien magique arrive dans votre boîte mail. Un clic, et vous êtes connecté — sans mot de passe.",
    icon: KeyRound,
    tint: "accent",
  },
  {
    title: "Consultez vos fiches",
    description: "Votre dernière fiche de paie s'affiche, lisible et détaillée, dès la publication.",
    icon: FileText,
    tint: "amber",
  },
  {
    title: "Retrouvez l'historique",
    description: "Toutes vos fiches publiées restent disponibles, classées par période, prêtes à télécharger.",
    icon: History,
    tint: "primary",
  },
];

const TRUST: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: "Vous, et vous seul",
    description: "Vos fiches sont strictement privées. La sécurité au niveau des lignes garantit que personne d'autre n'y accède.",
    icon: Lock,
  },
  {
    title: "Sans mot de passe",
    description: "La connexion par lien magique élimine les mots de passe oubliés et les fuites de mots de passe.",
    icon: Fingerprint,
  },
  {
    title: "Chaque action tracée",
    description: "Les opérations RH sensibles sont journalisées, pour une paie transparente et auditable.",
    icon: ShieldCheck,
  },
];

const EMPLOYEE_FEATURES: Array<{ title: string; description: string; icon: LucideIcon; tint: Tint }> = [
  {
    title: "Tout est clair",
    description: "Brut, net, retenues et primes présentés simplement, sans jargon.",
    icon: Wallet,
    tint: "teal",
  },
  {
    title: "Disponible à tout moment",
    description: "Votre espace est accessible jour et nuit, depuis votre téléphone ou votre ordinateur.",
    icon: Clock,
    tint: "amber",
  },
  {
    title: "Téléchargeable",
    description: "Récupérez vos fiches quand vous en avez besoin, pour un crédit, un bail ou vos archives.",
    icon: Download,
    tint: "primary",
  },
];

const REASSURANCE: Array<{ value: string; label: string; icon: LucideIcon; tint: Tint }> = [
  { value: "100 %", label: "Confidentiel par défaut", icon: Eye, tint: "teal" },
  { value: "0", label: "Mot de passe à retenir", icon: Fingerprint, tint: "accent" },
  { value: "24/7", label: "Accessible où que vous soyez", icon: Clock, tint: "amber" },
  { value: "1 clic", label: "Pour ouvrir votre espace", icon: KeyRound, tint: "primary" },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-[var(--shadow-md)]"
      >
        Aller au contenu
      </a>
      <SiteHeader />
      <main id="contenu">
        <Hero />
        <ReassuranceStrip />
        <ParcoursSection />
        <SecuritySection />
        <FeaturesSection />
        <TeamsSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Vibrant ambient backdrop */}
      <div aria-hidden="true" className="brand-mesh pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="max-w-2xl">
          <Reveal className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/12 px-3.5 py-1.5 text-xs font-bold text-accent-foreground">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            Votre paie, enfin limpide
          </Reveal>

          <Reveal
            as="h1"
            delay={60}
            className="mt-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-balance text-foreground sm:text-6xl"
          >
            Vos fiches de paie,
            <span className="relative whitespace-nowrap text-primary">
              {" "}en clair{" "}
              <svg
                aria-hidden="true"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-accent"
              >
                <path
                  d="M2 9 C 75 2, 225 2, 298 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            et en sécurité.
          </Reveal>

          <Reveal
            as="p"
            delay={120}
            className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground md:text-lg"
          >
            MadajobPay réunit toutes vos fiches de paie dans un espace personnel et confidentiel.
            Connectez-vous d&apos;un clic, consultez la dernière fiche et parcourez tout votre
            historique — sans mot de passe, sans paperasse.
          </Reveal>

          <Reveal delay={180} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition hover:bg-primary-strong hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href="/auth/login"
            >
              Accéder à mes fiches
              <ArrowRight
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <a
              className="inline-flex h-13 items-center justify-center rounded-2xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-foreground shadow-[var(--shadow-xs)] transition hover:border-primary/30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href="#parcours"
            >
              Comment ça marche
            </a>
          </Reveal>

          <Reveal
            delay={240}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
              Données privées et chiffrées
            </span>
            <span className="inline-flex items-center gap-2">
              <Fingerprint className="size-4 text-teal" aria-hidden="true" />
              Connexion par lien magique
            </span>
          </Reveal>
        </div>

        <Reveal delay={120} className="relative">
          <HeroShowcase />
        </Reveal>
      </div>
    </section>
  );
}

function ReassuranceStrip() {
  return (
    <section aria-label="En bref" className="border-y border-border bg-surface px-5 py-10 sm:px-6">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        {REASSURANCE.map((item, index) => (
          <Reveal
            key={item.label}
            delay={index * 80}
            className="flex items-center gap-3.5"
          >
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tintTile[item.tint]}`}>
              <item.icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-display text-xl font-bold tabular-nums text-foreground">
                {item.value}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">{item.label}</span>
            </span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center text-balance">
      <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </Reveal>
      {description ? (
        <Reveal as="p" delay={80} className="mt-4 text-pretty text-base leading-7 text-muted-foreground">
          {description}
        </Reveal>
      ) : null}
    </div>
  );
}

function ParcoursSection() {
  return (
    <section className="px-5 py-20 sm:px-6 md:py-24" id="parcours">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          title="Quatre étapes, et c'est réglé."
          description="De l'invitation à la consultation, tout est pensé pour être immédiat. Aucune compétence technique requise."
        />

        <ol className="relative mt-16 grid gap-x-6 gap-y-10 md:grid-cols-4">
          {/* Animated connector — horizontal on desktop, vertical on mobile */}
          <div
            aria-hidden="true"
            className="flow-line absolute left-[1.75rem] top-3 hidden w-px md:left-0 md:right-0 md:top-[1.75rem] md:block md:h-px md:w-auto"
            style={{ bottom: "1rem" }}
          />
          {STEPS.map((step, index) => (
            <Reveal as="li" delay={index * 100} className="relative pl-16 md:pl-0" key={step.title}>
              <div className="flex flex-col">
                <span
                  className={`relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-[var(--shadow-md)] ${tintNode[step.tint]} max-md:absolute max-md:left-0 max-md:top-0`}
                >
                  <step.icon className="size-6" aria-hidden="true" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-surface font-display text-[0.7rem] font-bold text-foreground shadow-[var(--shadow-sm)]">
                    {index + 1}
                  </span>
                </span>
                <h3 className="font-display text-base font-semibold text-foreground md:mt-5">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="px-5 py-6 sm:px-6" id="securite">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-ink-foreground shadow-[var(--shadow-lg)] sm:px-12">
          <div aria-hidden="true" className="brand-mesh-dark pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="aurora-blob -left-10 top-0 h-72 w-72 bg-teal/30"
            style={{ ["--aurora-dur" as string]: "24s" }}
          />
          <div
            aria-hidden="true"
            className="aurora-blob -bottom-16 right-0 h-72 w-72 bg-accent/25"
            style={{ ["--aurora-dur" as string]: "30s", animationDelay: "-10s" }}
          />

          <div className="relative">
            <div className="mx-auto max-w-2xl text-center">
              <Reveal className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/15 bg-ink-foreground/10 px-3.5 py-1.5 text-xs font-bold text-ink-foreground">
                <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
                Confiance &amp; confidentialité
              </Reveal>
              <Reveal as="h2" delay={60} className="mt-5 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Vos données restent les vôtres.
              </Reveal>
              <Reveal as="p" delay={120} className="mt-4 text-base leading-7 text-ink-muted">
                La paie touche à ce qu&apos;il y a de plus personnel. MadajobPay est construit autour
                d&apos;un principe simple : chacun ne voit que ce qui le concerne.
              </Reveal>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {TRUST.map((item, index) => (
                <Reveal delay={index * 100} key={item.title}>
                  <article className="group h-full rounded-2xl border border-ink-foreground/10 bg-ink-foreground/[0.05] p-6 transition-colors duration-300 hover:bg-ink-foreground/[0.09]">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform duration-300 group-hover:-translate-y-0.5">
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-muted">{item.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="px-5 py-20 sm:px-6 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="max-w-md">
            <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Un espace qui va à
              <span className="text-teal"> l&apos;essentiel.</span>
            </Reveal>
            <Reveal as="p" delay={80} className="mt-4 text-base leading-7 text-muted-foreground">
              Pas de tableaux de bord surchargés. Juste vos fiches, lisibles et disponibles
              quand vous en avez besoin.
            </Reveal>
            <Reveal delay={180}>
              <Link
                className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary-strong"
                href="/auth/login"
              >
                Ouvrir mon espace
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </Reveal>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {EMPLOYEE_FEATURES.map((feature, index) => (
              <Reveal delay={index * 100} key={feature.title}>
                <article className="group h-full rounded-2xl border border-border bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-md)]">
                  <span className={`flex size-12 items-center justify-center rounded-xl ${tintTile[feature.tint]} transition-transform duration-300 group-hover:-translate-y-0.5`}>
                    <feature.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Secondary read for HR / managers — present, but not dominating. */
function TeamsSection() {
  const items: Array<{ title: string; description: string; icon: LucideIcon; tint: Tint }> = [
    {
      title: "Managers d'agence",
      description: "Importez les fichiers de paie, contrôlez les écarts et publiez par période.",
      icon: Building2,
      tint: "teal",
    },
    {
      title: "RH centrale",
      description: "Vue multi-agences, journal d'audit des actions sensibles et analyses consolidées.",
      icon: ShieldCheck,
      tint: "primary",
    },
  ];

  return (
    <section className="px-5 py-6 sm:px-6" id="equipes">
      <div className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-surface px-6 py-12 shadow-[var(--shadow-sm)] sm:px-10">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-lg">
              <Reveal className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
                <Building2 className="size-3.5" aria-hidden="true" />
                Côté équipes
              </Reveal>
              <Reveal as="h2" delay={60} className="mt-4 font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Et pour les équipes RH &amp; managers ?
              </Reveal>
              <Reveal as="p" delay={120} className="mt-4 text-sm leading-6 text-muted-foreground">
                Le même outil gère l&apos;import, le contrôle et la publication de la paie, avec
                des accès séparés par périmètre. La connexion est commune : votre rôle ouvre le bon
                espace.
              </Reveal>
            </div>

            <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
              {items.map((item, index) => (
                <Reveal delay={index * 100} key={item.title}>
                  <article className="flex h-full gap-4 rounded-2xl border border-border bg-surface-elevated p-5">
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tintTile[item.tint]}`}>
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-24 pt-16 sm:px-6">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary to-primary-strong px-6 py-16 text-center text-primary-foreground shadow-[var(--shadow-lg)] sm:px-12">
        <div aria-hidden="true" className="brand-mesh-dark pointer-events-none absolute inset-0 opacity-80" />
        <div
          aria-hidden="true"
          className="aurora-blob -right-8 -top-10 h-64 w-64 bg-accent/30"
          style={{ ["--aurora-dur" as string]: "26s" }}
        />
        <div className="relative mx-auto max-w-2xl">
          <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Prêt à consulter votre fiche de paie ?
          </Reveal>
          <Reveal as="p" delay={60} className="mt-4 text-base leading-7 text-primary-foreground/80">
            Connectez-vous avec votre adresse professionnelle. Un lien sécurisé vous attend dans
            votre boîte mail.
          </Reveal>
          <Reveal delay={120} className="mt-9 flex justify-center">
            <Link
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-surface px-7 py-3.5 text-sm font-semibold text-primary shadow-[var(--shadow-md)] transition hover:bg-surface-elevated hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              href="/auth/login"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Me connecter
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <BrandLogo />
        <p className="text-center text-xs text-muted-foreground sm:text-right">
          Plateforme interne de fiches de paie. Accès réservé aux collaborateurs invités.
        </p>
      </div>
    </footer>
  );
}
