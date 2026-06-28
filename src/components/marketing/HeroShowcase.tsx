"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Download,
  FileText,
  Fingerprint,
  History,
  MailCheck,
  MousePointer2,
  Wallet,
  Wand2,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useCountUp, useInView, usePointerParallax, useSequence } from "@/components/marketing/useMotion";

/**
 * Immersive hero visual for MadajobPay: a self-playing guided demo that walks a
 * brand-new employee through the four things they came to do — sign in with a
 * magic link, read their net pay, browse their payslip history, and download a
 * PDF — all inside one persistent "app frame" wrapped in a drifting aurora.
 *
 * Why a walkthrough (not static chips): the visitor is someone who just wants to
 * see their salary. Showing the actual flow in motion is more explicit and more
 * reassuring than labelling features. A progress rail names each step and a
 * caption explains it, so the value lands even at a glance.
 *
 * Accessibility:
 * - The whole scene is presentational: role="img" with a single label that
 *   summarises the full journey, so screen readers never chase the animation.
 * - The loop, pointer parallax and entrance motion are all gated by
 *   useSequence / usePointerParallax / CSS, so reduced-motion and touch users
 *   get a calm static frame parked on the payslip (the payoff) with the four
 *   steps still named in the rail.
 */

const NET_PAY = 1_096_500;
const STEP_MS = 3600;
const SALARY_STEP = 1;

const STEPS = [
  {
    id: "magic",
    tab: "Lien magique",
    icon: Wand2,
    title: "Connexion par lien magique",
    sub: "Un lien reçu par e-mail, aucun mot de passe à retenir.",
  },
  {
    id: "salary",
    tab: "Mon salaire",
    icon: Wallet,
    title: "Votre net à payer, en clair",
    sub: "Calculé, vérifié et publié par votre employeur.",
  },
  {
    id: "history",
    tab: "Historique",
    icon: History,
    title: "Tout votre historique de paie",
    sub: "Chaque fiche archivée, accessible à tout moment.",
  },
  {
    id: "pdf",
    tab: "Télécharger",
    icon: Download,
    title: "Votre fiche officielle en PDF",
    sub: "Un document prêt à transmettre, en un geste.",
  },
] as const;

const BREAKDOWN: Array<{ label: string; amount: string; width: number; tone: "pos" | "neg" }> = [
  { label: "Salaire de base", amount: "1 250 000", width: 94, tone: "pos" },
  { label: "Prime d'ancienneté", amount: "+ 85 000", width: 36, tone: "pos" },
  { label: "Cotisations sociales", amount: "− 142 000", width: 48, tone: "neg" },
  { label: "Impôt sur le revenu", amount: "− 96 500", width: 40, tone: "neg" },
];

const HISTORY = [
  { month: "Juin 2026", amount: "1 096 500", current: true },
  { month: "Mai 2026", amount: "1 031 200", current: false },
  { month: "Avril 2026", amount: "1 008 750", current: false },
  { month: "Mars 2026", amount: "1 008 750", current: false },
];

const TREND = [38, 44, 41, 52, 49, 63, 71];

export function HeroShowcase() {
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const parallaxRef = usePointerParallax<HTMLDivElement>();
  const { index, tick, cycling } = useSequence(STEPS.length, STEP_MS, inView, SALARY_STEP);
  const step = STEPS[index];

  return (
    <div ref={inViewRef} className="relative">
      <div
        ref={parallaxRef}
        role="img"
        aria-label="Démonstration animée de l'espace salarié MadajobPay : connexion par lien magique, consultation du salaire net, historique des fiches de paie et téléchargement en PDF."
        className="hero-stage relative mx-auto w-full max-w-md"
      >
        {/* Drifting colour aurora */}
        <div aria-hidden="true" className="pointer-events-none absolute -inset-10 -z-10">
          <span
            className="aurora-blob left-[6%] top-[2%] h-44 w-44 bg-teal/45"
            style={{ ["--aurora-dur" as string]: "19s" }}
          />
          <span
            className="aurora-blob right-[2%] top-[14%] h-48 w-48 bg-accent/45"
            style={{ ["--aurora-dur" as string]: "23s", animationDelay: "-6s" }}
          />
          <span
            className="aurora-blob bottom-[0%] left-[28%] h-52 w-52 bg-primary/35"
            style={{ ["--aurora-dur" as string]: "27s", animationDelay: "-12s" }}
          />
        </div>

        {/* Persistent app frame */}
        <div className="hero-card relative overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface/95 shadow-[var(--shadow-glow)] backdrop-blur-sm">
          {/* Title bar */}
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-danger/70" />
                <span className="size-2.5 rounded-full bg-warning/70" />
                <span className="size-2.5 rounded-full bg-success/70" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground">Espace salarié</span>
            </div>
            <BrandLogo href={null} markSize={22} />
          </div>

          {/* Progress rail — names + tracks each step of the journey */}
          <div className="grid grid-cols-4 gap-2 border-b border-border/60 px-4 py-3">
            {STEPS.map((s, i) => {
              const fill = i < index ? "full" : i === index ? (cycling ? "active" : "full") : "empty";
              const StepIcon = s.icon;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1.5 text-center">
                  <span
                    className={`flex size-7 items-center justify-center rounded-lg transition-colors duration-300 ${
                      i === index
                        ? "bg-primary/12 text-primary"
                        : i < index
                          ? "bg-success/12 text-success"
                          : "bg-muted text-muted-foreground/60"
                    }`}
                  >
                    <StepIcon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span
                    className={`text-[0.56rem] font-bold uppercase tracking-[0.06em] transition-colors duration-300 ${
                      i === index ? "text-foreground" : "text-muted-foreground/60"
                    }`}
                  >
                    {s.tab}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      key={`${i}-${tick}`}
                      className={`block h-full origin-left rounded-full bg-gradient-to-r from-primary to-teal ${
                        fill === "active" ? "hero-fill" : ""
                      }`}
                      style={{
                        transform: fill === "full" ? "scaleX(1)" : fill === "empty" ? "scaleX(0)" : undefined,
                        ["--step-dur" as string]: `${STEP_MS}ms`,
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Screen — swaps per step, keyed by tick to replay choreography */}
          <div className="relative h-[19.5rem]">
            <div key={tick} className="hero-screen absolute inset-0">
              <StepScreen id={step.id} />
            </div>
          </div>
        </div>

        {/* Caption — explains the active step in plain language */}
        <div key={`cap-${tick}`} className="hero-caption mx-auto mt-5 max-w-sm px-4 text-center">
          <p className="font-display text-base font-bold text-foreground">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.sub}</p>
        </div>

        {/* Ambient trust chips — depth, not feature labels */}
        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -right-3 top-20 z-20 hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold shadow-[var(--shadow-lg)] sm:flex"
          style={{ ["--depth" as string]: "22px", animationDelay: "0.5s" }}
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success">
            <BadgeCheck className="size-3.5" />
          </span>
          Paiement vérifié
        </div>

        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -left-4 bottom-28 z-20 hidden items-center gap-1.5 rounded-full border border-teal/30 bg-teal/12 px-3 py-1.5 text-[0.7rem] font-bold text-teal shadow-[var(--shadow-md)] sm:flex"
          style={{ ["--depth" as string]: "30px", animationDelay: "0.9s" }}
        >
          <Fingerprint className="size-3.5" />
          Chiffré de bout en bout
        </div>
      </div>
    </div>
  );
}

function StepScreen({ id }: { id: (typeof STEPS)[number]["id"] }) {
  switch (id) {
    case "magic":
      return <MagicScreen />;
    case "salary":
      return <SalaryScreen />;
    case "history":
      return <HistoryScreen />;
    case "pdf":
      return <PdfScreen />;
  }
}

/* --- Step 1 — Magic-link login ------------------------------------------- */
function MagicScreen() {
  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MailCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-foreground">MadajobPay</p>
            <p className="text-[0.66rem] text-muted-foreground">à l&apos;instant · sécurisé</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">Votre fiche de juin est prête</p>
        <p className="mt-1 text-[0.72rem] text-muted-foreground">
          Ouvrez votre espace en toute sécurité, sans mot de passe.
        </p>

        {/* Magic-link button + simulated tap + success */}
        <div className="relative mt-4">
          <span className="hero-press flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-strong text-sm font-bold text-primary-foreground shadow-[var(--shadow-md)]">
            <Wand2 className="size-4" aria-hidden="true" />
            Ouvrir mon espace
          </span>

          {/* tap ripple */}
          <span className="hero-ripple pointer-events-none absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground/40" />

          {/* simulated cursor arriving + pressing */}
          <span className="hero-cursor pointer-events-none absolute left-1/2 top-1/2 text-foreground drop-shadow">
            <MousePointer2 className="size-5 fill-surface" aria-hidden="true" />
          </span>

          {/* success confirmation */}
          <span className="hero-success pointer-events-none absolute -right-2 -top-3 flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-[0.62rem] font-bold text-success-foreground shadow-[var(--shadow-md)]">
            <Check className="size-3" aria-hidden="true" />
            Connecté
          </span>
        </div>
      </div>
    </div>
  );
}

/* --- Step 2 — See your salary -------------------------------------------- */
function SalaryScreen() {
  const net = useCountUp(NET_PAY, true, 1500);
  const formattedNet = net.toLocaleString("fr-FR");

  return (
    <div className="flex h-full flex-col justify-center px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Fiche de paie
          </p>
          <p className="mt-1 font-display text-base font-bold text-foreground">Juin 2026</p>
        </div>
        <span className="hero-shimmer relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-success/12 px-3 py-1.5 text-[0.68rem] font-bold text-success">
          <BadgeCheck className="size-3.5" aria-hidden="true" />
          Publiée
        </span>
      </div>

      {/* Net pay — counts up */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-primary to-primary-strong px-5 py-4 text-primary-foreground shadow-[var(--shadow-md)]">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
          Net à payer
        </p>
        <p className="mt-1 flex items-baseline gap-1.5 font-display text-[2.1rem] font-bold leading-none tabular-nums">
          {formattedNet}
          <span className="text-sm font-semibold text-primary-foreground/75">MGA</span>
        </p>
        <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-[0.66rem] font-bold text-accent-foreground">
          <ArrowUpRight className="size-3" aria-hidden="true" />
          +6,3 % vs mai
        </span>
      </div>

      {/* Breakdown bars */}
      <div className="mt-3.5 space-y-2.5">
        {BREAKDOWN.map((line, i) => (
          <div key={line.label} className="space-y-1">
            <div className="flex items-center justify-between text-[0.72rem]">
              <span className="text-muted-foreground">{line.label}</span>
              <span
                className={`font-semibold tabular-nums ${
                  line.tone === "neg" ? "text-danger" : "text-foreground"
                }`}
              >
                {line.amount}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`hero-bar h-full rounded-full ${
                  line.tone === "neg"
                    ? "bg-danger/55"
                    : i === 0
                      ? "bg-gradient-to-r from-primary to-teal"
                      : "bg-accent"
                }`}
                style={{ width: `${line.width}%`, animationDelay: `${0.2 + i * 0.1}s` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Step 3 — Payslip history -------------------------------------------- */
function HistoryScreen() {
  return (
    <div className="flex h-full flex-col justify-center px-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-foreground">Historique de paie</p>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[0.62rem] font-bold text-muted-foreground">
          14 fiches
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {HISTORY.map((row, i) => (
          <div
            key={row.month}
            className={`hero-row flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
              row.current ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/40"
            }`}
            style={{ animationDelay: `${0.15 + i * 0.11}s` }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex size-7 items-center justify-center rounded-lg ${
                  row.current ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground"
                }`}
              >
                <FileText className="size-3.5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold text-foreground">{row.month}</p>
                <p className="text-[0.6rem] text-muted-foreground">Net à payer</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tabular-nums text-foreground">{row.amount}</span>
              <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2.5 border-t border-border/60 pt-3">
        <svg viewBox="0 0 80 28" className="h-7 w-20" aria-hidden="true">
          <polyline
            className="hero-ring"
            points={TREND.map((v, i) => `${(i / (TREND.length - 1)) * 78 + 1},${27 - (v / 80) * 24}`).join(" ")}
            fill="none"
            stroke="hsl(var(--teal))"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        </svg>
        <span className="text-[0.68rem] font-medium text-muted-foreground">Revenus 2026 en hausse</span>
      </div>
    </div>
  );
}

/* --- Step 4 — Download PDF ------------------------------------------------ */
function PdfScreen() {
  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
        {/* Document preview */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-danger/12 text-danger">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-foreground">Fiche_de_paie_Juin_2026.pdf</p>
            <p className="text-[0.62rem] text-muted-foreground">Document officiel · 142 Ko</p>
          </div>
        </div>

        <div className="mt-3.5 space-y-2">
          {[92, 74, 84, 58].map((w, i) => (
            <span
              key={w}
              className="hero-line block h-1.5 origin-left rounded-full bg-border"
              style={{ width: `${w}%`, animationDelay: `${0.2 + i * 0.12}s` }}
            />
          ))}
        </div>

        {/* Download button with filling ring + cursor + success */}
        <div className="relative mt-4">
          <span className="hero-press flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-bold text-foreground shadow-[var(--shadow-xs)]">
            <span className="relative flex size-5 items-center justify-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 size-5 -rotate-90" aria-hidden="true">
                <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                <circle
                  className="hero-dl-ring"
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="4"
                  strokeLinecap="round"
                  pathLength={1}
                />
              </svg>
              <Download className="hero-dl-icon size-3.5 text-primary" aria-hidden="true" />
              <Check className="hero-dl-check absolute size-3.5 text-success" aria-hidden="true" />
            </span>
            Télécharger le PDF
          </span>

          <span className="hero-ripple pointer-events-none absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25" />

          <span className="hero-cursor pointer-events-none absolute left-1/2 top-1/2 text-foreground drop-shadow">
            <MousePointer2 className="size-5 fill-surface" aria-hidden="true" />
          </span>

          <span
            className="hero-success pointer-events-none absolute -right-2 -top-3 flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-[0.62rem] font-bold text-success-foreground shadow-[var(--shadow-md)]"
            style={{ animationDelay: "2.7s" }}
          >
            <Check className="size-3" aria-hidden="true" />
            Enregistré
          </span>
        </div>
      </div>
    </div>
  );
}
