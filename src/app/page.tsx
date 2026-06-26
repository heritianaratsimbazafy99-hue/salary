import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Building2,
  Clock,
  Download,
  FileText,
  Fingerprint,
  History,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { HeroShowcase } from "@/components/marketing/HeroShowcase";
import { Reveal } from "@/components/marketing/Reveal";

const STEPS: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: "Recevez votre accès",
    description: "Votre employeur vous invite avec votre adresse professionnelle. Rien à installer.",
    icon: Mail,
  },
  {
    title: "Connectez-vous",
    description: "Un lien magique arrive dans votre boîte mail. Un clic, et vous êtes connecté — sans mot de passe.",
    icon: LogIn,
  },
  {
    title: "Consultez vos fiches",
    description: "Votre dernière fiche de paie s'affiche, lisible et détaillée, dès la publication.",
    icon: FileText,
  },
  {
    title: "Retrouvez l'historique",
    description: "Toutes vos fiches publiées restent disponibles, classées par période, prêtes à télécharger.",
    icon: History,
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

const EMPLOYEE_FEATURES: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: "Tout est clair",
    description: "Brut, net, retenues et primes présentés simplement, sans jargon.",
    icon: Wallet,
  },
  {
    title: "Disponible à tout moment",
    description: "Votre espace est accessible jour et nuit, depuis votre téléphone ou votre ordinateur.",
    icon: Clock,
  },
  {
    title: "Téléchargeable",
    description: "Récupérez vos fiches quand vous en avez besoin, pour un crédit, un bail ou vos archives.",
    icon: Download,
  },
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

function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <Link className="group flex items-center gap-3" href="/" aria-label="Salary — accueil">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-primary-foreground shadow-[var(--shadow-sm)] transition-transform duration-300 group-hover:-translate-y-0.5">
        S
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold tracking-tight">Salary</span>
        {subtitle ? (
          <span className="block text-xs text-muted-foreground">Espace salarié</span>
        ) : null}
      </span>
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Logo />
        <nav
          aria-label="Sections"
          className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
        >
          <a className="transition-colors hover:text-foreground" href="#parcours">
            Comment ça marche
          </a>
          <a className="transition-colors hover:text-foreground" href="#securite">
            Sécurité
          </a>
          <a className="transition-colors hover:text-foreground" href="#equipes">
            RH &amp; managers
          </a>
        </nav>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href="/auth/login"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Connexion
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="max-w-2xl">
          <Reveal className="animate-rise inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Votre paie, simplifiée
          </Reveal>
          <Reveal as="h1" delay={60} className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance text-foreground sm:text-5xl md:text-6xl">
            Vos fiches de paie,
            <span className="relative whitespace-nowrap text-primary">
              {" "}en clair{" "}
              <svg
                aria-hidden="true"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-accent/70"
              >
                <path d="M2 9 C 75 2, 225 2, 298 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
            et en sécurité.
          </Reveal>
          <Reveal as="p" delay={120} className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
            Salary réunit toutes vos fiches de paie dans un espace personnel et confidentiel.
            Connectez-vous d&apos;un clic, consultez la dernière fiche et parcourez tout votre
            historique — sans mot de passe, sans paperasse.
          </Reveal>
          <Reveal delay={180} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href="/auth/login"
            >
              Accéder à mes fiches
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <a
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground shadow-[var(--shadow-xs)] transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href="#parcours"
            >
              Comment ça marche
            </a>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
              Données privées et chiffrées
            </span>
            <span className="inline-flex items-center gap-2">
              <Fingerprint className="size-4 text-success" aria-hidden="true" />
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

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
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
    <section className="border-t border-border bg-surface px-5 py-20 sm:px-6" id="parcours">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          title="Quatre étapes, et c'est réglé."
          description="De l'invitation à la consultation, tout est pensé pour être immédiat. Aucune compétence technique requise."
        />

        <ol className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-5">
          {/* Connector line on desktop */}
          <div
            aria-hidden="true"
            className="flow-line absolute left-0 right-0 top-7 hidden h-px md:block"
          />
          {STEPS.map((step, index) => (
            <Reveal as="li" delay={index * 90} className="relative" key={step.title}>
              <div className="relative flex flex-col">
                <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
                  <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-primary shadow-[var(--shadow-sm)]">
                    <step.icon className="size-6" aria-hidden="true" />
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary font-display text-[0.65rem] font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                  </span>
                  <h3 className="font-display text-base font-semibold md:mt-5">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>
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
    <section className="px-5 py-20 sm:px-6" id="securite">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-3xl border border-ink/30 bg-ink px-6 py-14 text-ink-foreground shadow-[var(--shadow-lg)] sm:px-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          </div>

          <div className="relative">
            <div className="mx-auto max-w-2xl text-center">
              <Reveal className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/15 bg-ink-foreground/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Confiance &amp; confidentialité
              </Reveal>
              <Reveal as="h2" delay={60} className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Vos données restent les vôtres.
              </Reveal>
              <Reveal as="p" delay={120} className="mt-4 text-base leading-7 text-ink-muted">
                La paie touche à ce qu&apos;il y a de plus personnel. Salary est construit autour
                d&apos;un principe simple : chacun ne voit que ce qui le concerne.
              </Reveal>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {TRUST.map((item, index) => (
                <Reveal delay={index * 90} key={item.title}>
                  <article className="h-full rounded-2xl border border-ink-foreground/10 bg-ink-foreground/[0.04] p-6 transition-colors duration-300 hover:bg-ink-foreground/[0.07]">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
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
    <section className="border-t border-border bg-surface px-5 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="max-w-md">
            <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Un espace qui va à l&apos;essentiel.
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
              <Reveal delay={index * 90} key={feature.title}>
                <article className="group h-full rounded-2xl border border-border bg-surface-elevated p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-md)]">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
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
  const items: Array<{ title: string; description: string; icon: LucideIcon }> = [
    {
      title: "Managers d'agence",
      description: "Importez les fichiers de paie, contrôlez les écarts et publiez par période.",
      icon: Building2,
    },
    {
      title: "RH centrale",
      description: "Vue multi-agences, journal d'audit des actions sensibles et analyses consolidées.",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="px-5 py-20 sm:px-6" id="equipes">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-border bg-surface-elevated px-6 py-12 sm:px-10">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-lg">
              <Reveal as="h2" className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Et pour les équipes RH &amp; managers ?
              </Reveal>
              <Reveal as="p" delay={80} className="mt-4 text-sm leading-6 text-muted-foreground">
                Le même outil gère l&apos;import, le contrôle et la publication de la paie, avec
                des accès séparés par périmètre. La connexion est commune : votre rôle ouvre le bon
                espace.
              </Reveal>
            </div>

            <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
              {items.map((item, index) => (
                <Reveal delay={index * 90} key={item.title}>
                  <article className="flex h-full gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-xs)]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
    <section className="px-5 pb-24 pt-4 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Prêt à consulter votre fiche de paie ?
        </Reveal>
        <Reveal as="p" delay={60} className="mt-4 text-base leading-7 text-muted-foreground">
          Connectez-vous avec votre adresse professionnelle. Un lien sécurisé vous attend dans
          votre boîte mail.
        </Reveal>
        <Reveal delay={120} className="mt-8 flex justify-center">
          <Link
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/auth/login"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Me connecter
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo subtitle={false} />
        <p className="text-center text-xs text-muted-foreground sm:text-right">
          Plateforme interne de fiches de paie. Accès réservé aux collaborateurs invités.
        </p>
      </div>
    </footer>
  );
}
