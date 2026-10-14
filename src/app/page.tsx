import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileText,
  Fingerprint,
  HelpCircle,
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
import { RoleShowcase } from "@/components/marketing/RoleShowcase";

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
        <RolesSection />
        <FeaturesSection />
        <SecuritySection />
        <FaqSection />
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
            <span className="relative whitespace-nowrap">
              {" "}<span className="text-gradient">en clair</span>{" "}
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

          <Reveal delay={300} className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Je suis</span>
            {[
              { label: "Salarié", icon: Wallet },
              { label: "Manager d'agence", icon: Building2 },
              { label: "RH centrale", icon: ShieldCheck },
            ].map((item) => (
              <a
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3.5 text-sm font-semibold text-foreground shadow-[var(--shadow-xs)] backdrop-blur transition hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--shadow-sm)]"
                href="#equipes"
                key={item.label}
              >
                <item.icon className="size-4 text-primary" aria-hidden="true" />
                {item.label}
              </a>
            ))}
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

function RolesSection() {
  return (
    <section className="relative overflow-hidden px-5 py-20 sm:px-6 md:py-24" id="equipes">
      <div aria-hidden="true" className="brand-mesh pointer-events-none absolute inset-0 -z-10 opacity-70" />
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          title="Une plateforme, trois espaces."
          description="Votre rôle ouvre automatiquement le bon espace. Chacun ne voit que ce qui le concerne."
        />
        <RoleShowcase />
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="px-5 py-20 sm:px-6 md:py-24" id="fonctionnalites">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          title="Un espace qui va à l'essentiel."
          description="Pas de tableaux de bord surchargés. Juste vos fiches, lisibles et disponibles quand vous en avez besoin."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <article className="group relative h-full overflow-hidden rounded-[1.75rem] border border-border bg-surface p-6 shadow-[var(--shadow-sm)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] sm:p-8">
              <span className={`flex size-12 items-center justify-center rounded-xl ${tintTile.teal}`}>
                <Wallet className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold">Tout est clair</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Brut, net, retenues et primes présentés simplement, sans jargon — avec la part de
                chaque élément en un coup d&apos;œil.
              </p>
              <div aria-hidden="true" className="mt-7 grid gap-3">
                <div className="flex h-4 overflow-hidden rounded-full bg-muted">
                  <span className="chart-bar h-full w-[78%] bg-gradient-to-r from-primary to-teal" />
                  <span className="chart-bar h-full w-[14%] border-l-2 border-surface bg-amber" style={{ animationDelay: "120ms" }} />
                  <span className="chart-bar h-full w-[8%] border-l-2 border-surface bg-danger/70" style={{ animationDelay: "240ms" }} />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-teal" />Net perçu</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber" />Cotisations</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-danger/70" />Impôt</span>
                </div>
              </div>
            </article>
          </Reveal>
          <Reveal delay={80} className="md:col-span-2">
            <article className="relative h-full overflow-hidden rounded-[1.75rem] bg-ink p-6 text-ink-foreground shadow-[var(--shadow-md)] sm:p-8">
              <div aria-hidden="true" className="brand-mesh-dark pointer-events-none absolute inset-0" />
              <div className="relative">
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Clock className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-5 font-display text-5xl font-bold tracking-tight">24/7</p>
                <h3 className="mt-2 font-display text-lg font-semibold">Disponible à tout moment</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Depuis votre téléphone ou votre ordinateur, de jour comme de nuit.
                </p>
              </div>
            </article>
          </Reveal>
          <Reveal delay={120} className="md:col-span-3">
            <article className="h-full rounded-[1.75rem] border border-border bg-surface p-6 shadow-[var(--shadow-sm)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] sm:p-8">
              <span className={`flex size-12 items-center justify-center rounded-xl ${tintTile.primary}`}>
                <Download className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">Téléchargeable</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Récupérez vos fiches quand vous en avez besoin, pour un crédit, un bail ou vos archives.
              </p>
              <div aria-hidden="true" className="mt-6 flex flex-wrap gap-2">
                {[["PDF", "bg-danger/10 text-danger"], ["CSV", "bg-success/12 text-success"], ["Impression", "bg-primary/10 text-primary"]].map(([label, tone]) => (
                  <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${tone}`} key={label}>
                    <FileText className="size-3.5" />
                    {label}
                  </span>
                ))}
              </div>
            </article>
          </Reveal>
          <Reveal delay={160} className="md:col-span-3">
            <article className="h-full rounded-[1.75rem] border border-border bg-surface p-6 shadow-[var(--shadow-sm)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] sm:p-8">
              <span className={`flex size-12 items-center justify-center rounded-xl ${tintTile.amber}`}>
                <History className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">Un an d&apos;historique</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Chaque fiche publiée reste consultable pendant un an, classée par période.
              </p>
              <div aria-hidden="true" className="mt-6 flex h-16 items-end gap-1.5">
                {[48, 56, 52, 60, 58, 66, 62, 70, 68, 74, 72, 84].map((value, index) => (
                  <span
                    className={`chart-col flex-1 rounded-t ${index === 11 ? "bg-gradient-to-b from-amber to-primary" : "bg-amber/30"}`}
                    key={index}
                    style={{ height: `${value}%`, animationDelay: `${index * 40}ms` }}
                  />
                ))}
              </div>
            </article>
          </Reveal>
        </div>
        <Reveal delay={200} className="mt-10 flex justify-center">
          <Link
            className="group inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary transition hover:bg-primary/[0.06] hover:text-primary-strong"
            href="/auth/login"
          >
            Ouvrir mon espace
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "Dois-je créer un mot de passe ?",
    answer: "Non. Vous saisissez votre adresse professionnelle et recevez un lien de connexion à usage unique. Rien à mémoriser.",
  },
  {
    question: "Mon lien de connexion ne fonctionne plus, que faire ?",
    answer: "Les liens sont valables un court instant et un nouveau lien remplace le précédent. Demandez-en simplement un nouveau depuis la page de connexion et ouvrez-le dans le même navigateur.",
  },
  {
    question: "Combien de temps mes fiches restent-elles disponibles ?",
    answer: "Chaque fiche reste consultable pendant un an à compter de sa publication. Pensez à télécharger celles que vous souhaitez conserver.",
  },
  {
    question: "Qui peut voir ma fiche de paie ?",
    answer: "Vous seul dans votre espace salarié. Les équipes RH et managers n'accèdent qu'aux données de leur périmètre, et leurs actions sensibles sont journalisées.",
  },
  {
    question: "Cette fiche remplace-t-elle mon bulletin officiel ?",
    answer: "MadajobPay diffuse des fiches internes issues d'une paie déjà validée par votre employeur. Il ne calcule pas les obligations réglementaires de paie.",
  },
];

function FaqSection() {
  return (
    <section className="px-5 py-20 sm:px-6 md:py-24" id="faq">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Reveal className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
            <HelpCircle className="size-3.5" aria-hidden="true" />
            Questions fréquentes
          </Reveal>
          <Reveal as="h2" delay={60} className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Vous vous posez la question ?
          </Reveal>
          <Reveal as="p" delay={120} className="mt-4 text-base leading-7 text-muted-foreground">
            Les réponses aux questions les plus courantes. Le guide intégré détaille chaque étape une
            fois connecté.
          </Reveal>
        </div>
        <div className="grid gap-3">
          {FAQ.map((item, index) => (
            <Reveal delay={index * 60} key={item.question}>
              <details className="group rounded-2xl border border-border bg-surface shadow-[var(--shadow-xs)] transition open:shadow-[var(--shadow-md)]">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 font-display text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {item.question}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
                    <ChevronDown className="details-chevron size-4 transition-transform duration-300" aria-hidden="true" />
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </details>
            </Reveal>
          ))}
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
    <footer className="border-t border-border bg-surface px-5 pb-10 pt-14 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <BrandLogo />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Plateforme interne de fiches de paie. Accès réservé aux collaborateurs invités.
          </p>
        </div>
        <nav aria-label="Découvrir" className="grid content-start gap-3 text-sm">
          <p className="font-display font-semibold">Découvrir</p>
          <a className="text-muted-foreground transition hover:text-foreground" href="#parcours">Comment ça marche</a>
          <a className="text-muted-foreground transition hover:text-foreground" href="#equipes">Les espaces</a>
          <a className="text-muted-foreground transition hover:text-foreground" href="#securite">Sécurité</a>
          <a className="text-muted-foreground transition hover:text-foreground" href="#faq">Questions fréquentes</a>
        </nav>
        <div className="grid content-start gap-3 text-sm">
          <p className="font-display font-semibold">Accès</p>
          <Link className="inline-flex items-center gap-2 text-muted-foreground transition hover:text-foreground" href="/auth/login">
            <LogIn className="size-4" aria-hidden="true" />
            Me connecter
          </Link>
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" />
            Données privées et chiffrées
          </p>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-border pt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} MadajobPay · Fiches internes issues d&apos;une paie validée.
      </div>
    </footer>
  );
}
