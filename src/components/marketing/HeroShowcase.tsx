"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Check,
  Download,
  FileText,
  Fingerprint,
  History,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Self-playing showcase of the employee journey on MadajobPay. Four scenes auto-
 * advance on a loop, each demonstrating one feature an employee actually uses:
 * passwordless login, a readable payslip, the full history, and CSV download.
 *
 * Accessibility:
 * - Respects prefers-reduced-motion: pins the payslip scene, no auto-advance,
 *   CSS disables every keyframe.
 * - Scene tabs are real buttons (≥44px target) so the demo is also navigable
 *   by tap/keyboard, not motion-only.
 */

const SCENE_MS = 3600;

type Scene = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const SCENES: Scene[] = [
  { id: "login", label: "Connexion", hint: "par lien magique", icon: Fingerprint },
  { id: "payslip", label: "Votre fiche", hint: "en clair", icon: FileText },
  { id: "history", label: "Historique", hint: "complet", icon: History },
  { id: "export", label: "Télécharger", hint: "en CSV", icon: Download },
];

const PAYSLIP_LINES: Array<[string, string, "pos" | "neg"]> = [
  ["Salaire de base", "1 250 000", "pos"],
  ["Prime d'ancienneté", "85 000", "pos"],
  ["Cotisations sociales", "− 142 000", "neg"],
  ["Impôt sur le revenu", "− 96 500", "neg"],
];

const HISTORY = [
  ["Mai 2026", "1 081 200"],
  ["Avril 2026", "1 074 900"],
  ["Mars 2026", "1 068 500"],
  ["Février 2026", "1 060 000"],
];

export function HeroShowcase() {
  const [scene, setScene] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect reduced-motion once, on the client, and pin to the payslip scene.
  // Deferred out of the synchronous effect body to avoid a cascading render.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq.matches) return;
    const raf = requestAnimationFrame(() => {
      setReduced(true);
      setScene(1);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-advance. Re-arms whenever the scene changes, so manual jumps stay in
  // rhythm. Disabled under reduced-motion or while the user is interacting.
  useEffect(() => {
    if (reduced || paused) return;
    const id = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(id);
  }, [scene, paused, reduced]);

  useEffect(() => () => {
    if (resume.current) clearTimeout(resume.current);
  }, []);

  function jumpTo(index: number) {
    setScene(index);
    if (reduced) return;
    // Brief pause so the user can read the scene they picked.
    setPaused(true);
    if (resume.current) clearTimeout(resume.current);
    resume.current = setTimeout(() => setPaused(false), SCENE_MS * 1.4);
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Ambient halo for depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/12 via-transparent to-accent/12 blur-2xl"
      />

      {/* Floating "new payslip" badge */}
      <div className="animate-float absolute -right-3 -top-4 z-20 hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold shadow-[var(--shadow-md)] sm:flex">
        <span className="pulse-dot inline-block size-2 rounded-full bg-success" aria-hidden="true" />
        Nouvelle fiche publiée
      </div>

      {/* Device window */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]">
        {/* Title bar — MadajobPay employee space */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-danger/70" />
              <span className="size-2.5 rounded-full bg-warning/70" />
              <span className="size-2.5 rounded-full bg-success/70" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground">Espace salarié</span>
          </div>
          <BrandLogo href={null} markSize={24} />
        </div>

        {/* Scene stage */}
        <div className="relative h-[20rem] overflow-hidden bg-surface-elevated px-5 py-5 sm:h-[21rem]">
          {/* Scanning sweep for an immersive, "live" feel */}
          <div
            aria-hidden="true"
            className="hero-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/10 to-transparent"
          />
          <div key={scene} className="hero-scene relative h-full">
            {scene === 0 ? <SceneLogin /> : null}
            {scene === 1 ? <ScenePayslip /> : null}
            {scene === 2 ? <SceneHistory /> : null}
            {scene === 3 ? <SceneDownload /> : null}
          </div>
        </div>
      </div>

      {/* Feature tabs — explicit, tappable index of what the demo shows */}
      <div
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="tablist"
        aria-label="Fonctionnalités de l'espace salarié"
      >
        {SCENES.map((s, i) => {
          const active = i === scene;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => jumpTo(i)}
              className={`group relative flex min-h-11 flex-col items-start gap-0.5 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                active
                  ? "border-primary/40 bg-surface shadow-[var(--shadow-sm)]"
                  : "border-border bg-surface/60 hover:border-primary/25 hover:bg-surface"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <s.icon
                  className={`size-3.5 ${active ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span
                  className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {s.label}
                </span>
              </span>
              <span className="text-[0.65rem] leading-none text-muted-foreground">{s.hint}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-border/60"
                >
                  <span
                    key={`${scene}-${paused}`}
                    className={`block h-full bg-primary ${reduced || paused ? "" : "hero-progress"}`}
                    style={reduced || paused ? { transform: "scaleX(1)" } : undefined}
                  />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SceneLogin() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Mail className="size-7" aria-hidden="true" />
        <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">Votre lien de connexion</p>
        <p className="mt-1 text-xs text-muted-foreground">Reçu sur votre adresse professionnelle</p>
      </div>
      <span className="hero-glow inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-md)]">
        <Fingerprint className="size-4" aria-hidden="true" />
        Se connecter en un clic
      </span>
      <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-success">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Sans mot de passe · chiffré de bout en bout
      </p>
    </div>
  );
}

function ScenePayslip() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Fiche de paie
          </p>
          <p className="font-display text-sm font-semibold text-foreground">Juin 2026</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[0.65rem] font-semibold text-success">
          <BadgeCheck className="size-3" aria-hidden="true" />
          Publiée
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {PAYSLIP_LINES.map(([label, amount, tone], i) => (
          <div
            key={label}
            className="hero-line flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[0.8rem] shadow-[var(--shadow-xs)]"
            style={{ animationDelay: `${0.12 + i * 0.1}s` }}
          >
            <span className="text-muted-foreground">{label}</span>
            <span
              className={`font-semibold tabular-nums ${tone === "neg" ? "text-danger" : "text-foreground"}`}
            >
              {amount}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">
            Net à payer
          </p>
          <p className="hero-count mt-0.5 font-display text-2xl font-bold tabular-nums text-foreground">
            1 096 500 <span className="text-sm font-medium text-muted-foreground">MGA</span>
          </p>
        </div>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)]">
          <Download className="size-3.5 text-primary" aria-hidden="true" />
          CSV
        </span>
      </div>
    </div>
  );
}

function SceneHistory() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-foreground">Toutes vos fiches</p>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
          14 disponibles
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {HISTORY.map(([month, amount], i) => (
          <div
            key={month}
            className="hero-line flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]"
            style={{ animationDelay: `${0.1 + i * 0.09}s` }}
          >
            <span className="flex items-center gap-2 text-[0.8rem] font-medium text-foreground">
              <BadgeCheck className="size-4 text-success" aria-hidden="true" />
              {month}
            </span>
            <span className="text-[0.78rem] font-semibold tabular-nums text-muted-foreground">
              {amount} <span className="text-[0.62rem] font-medium">MGA</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-3 text-center text-[0.7rem] text-muted-foreground">
        Classées par période, prêtes à consulter
      </p>
    </div>
  );
}

function SceneDownload() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="relative flex size-20 items-center justify-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            className="hero-ring"
          />
        </svg>
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-6" aria-hidden="true" />
        </span>
      </span>
      <div>
        <p className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
          fiches-paie-2026.csv
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-success">
          <Check className="size-3.5" aria-hidden="true" />
          Téléchargé
        </p>
      </div>
      <p className="max-w-[16rem] text-[0.7rem] leading-5 text-muted-foreground">
        Gardez vos justificatifs pour un crédit, un bail ou vos archives personnelles.
      </p>
    </div>
  );
}
