"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Download,
  Fingerprint,
  Sparkles,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useCountUp, useInView, usePointerParallax } from "@/components/marketing/useMotion";

/**
 * Immersive hero visual for MadajobPay: a "live" payslip that counts its net pay
 * up on entrance, draws its breakdown bars, and tilts gently under the pointer
 * inside a drifting colour aurora. Status chips float around it.
 *
 * Accessibility:
 * - The whole scene is presentational; a single descriptive label summarises it
 *   for assistive tech, and the animating figures are mirrored by sr-only static
 *   text so screen readers never chase a counter.
 * - Parallax and entrance motion are gated by usePointerParallax / CSS so
 *   reduced-motion and touch users get a calm, fully-legible static composition.
 */

const NET_PAY = 1_096_500;

const BREAKDOWN: Array<{ label: string; amount: string; width: number; tone: "pos" | "neg" }> = [
  { label: "Salaire de base", amount: "1 250 000", width: 94, tone: "pos" },
  { label: "Prime d'ancienneté", amount: "+ 85 000", width: 36, tone: "pos" },
  { label: "Cotisations sociales", amount: "− 142 000", width: 48, tone: "neg" },
  { label: "Impôt sur le revenu", amount: "− 96 500", width: 40, tone: "neg" },
];

const TREND = [38, 44, 41, 52, 49, 63, 71];

export function HeroShowcase() {
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();
  const parallaxRef = usePointerParallax<HTMLDivElement>();
  const net = useCountUp(NET_PAY, inView, 1600);
  const formattedNet = net.toLocaleString("fr-FR");

  return (
    <div ref={inViewRef} className="relative">
      <div ref={parallaxRef} className="hero-stage relative mx-auto w-full max-w-md">
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

        {/* Live payslip card */}
        <div
          role="img"
          aria-label={`Aperçu d'une fiche de paie MadajobPay de juin 2026, publiée, avec un net à payer de ${formattedNet} ariary.`}
          className="hero-card relative overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface/95 shadow-[var(--shadow-glow)] backdrop-blur-sm"
        >
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

          {/* Body */}
          <div className="relative px-5 py-5">
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
            <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-primary-strong px-5 py-4 text-primary-foreground shadow-[var(--shadow-md)]">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
                Net à payer
              </p>
              <p className="mt-1 flex items-baseline gap-1.5 font-display text-[2.1rem] font-bold leading-none tabular-nums">
                <span aria-hidden="true">{formattedNet}</span>
                <span className="text-sm font-semibold text-primary-foreground/75">MGA</span>
              </p>
              <span className="sr-only">{formattedNet} ariary</span>
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-[0.66rem] font-bold text-accent-foreground">
                <ArrowUpRight className="size-3" aria-hidden="true" />
                +6,3 % vs mai
              </span>
            </div>

            {/* Breakdown bars */}
            <div className="mt-4 space-y-2.5" aria-hidden="true">
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
                      style={{
                        width: `${inView ? line.width : 0}%`,
                        animationDelay: `${0.3 + i * 0.12}s`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer: trend + download */}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div className="flex items-center gap-2.5">
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
                <span className="text-[0.68rem] font-medium text-muted-foreground">
                  14 fiches
                </span>
              </div>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)]">
                <Download className="size-3.5 text-primary" aria-hidden="true" />
                CSV
              </span>
            </div>
          </div>
        </div>

        {/* Floating status chips */}
        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -right-3 top-12 z-20 hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold shadow-[var(--shadow-lg)] sm:flex"
          style={{ ["--depth" as string]: "20px", animationDelay: "0.5s" }}
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-3.5" />
          </span>
          Lien magique envoyé
        </div>

        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -left-4 bottom-16 z-20 hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs font-semibold shadow-[var(--shadow-lg)] sm:flex"
          style={{ ["--depth" as string]: "30px", animationDelay: "0.8s" }}
        >
          <span className="pulse-dot inline-block size-2 rounded-full bg-success" />
          Nouvelle fiche publiée
        </div>

        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -left-3 -top-5 z-20 hidden items-center gap-1.5 rounded-full border border-amber/30 bg-amber/15 px-3 py-1.5 text-[0.7rem] font-bold text-amber-foreground shadow-[var(--shadow-md)] sm:flex"
          style={{ ["--depth" as string]: "14px", animationDelay: "1.1s" }}
        >
          <Sparkles className="badge-twinkle size-3.5 text-amber" />
          Sans mot de passe
        </div>

        <div
          aria-hidden="true"
          className="hero-chip hero-parallax absolute -bottom-3 right-6 z-20 hidden items-center gap-1.5 rounded-full border border-teal/30 bg-teal/12 px-3 py-1.5 text-[0.7rem] font-bold text-teal sm:flex"
          style={{ ["--depth" as string]: "24px", animationDelay: "1.3s" }}
        >
          <Fingerprint className="size-3.5" />
          Chiffré de bout en bout
        </div>
      </div>
    </div>
  );
}
