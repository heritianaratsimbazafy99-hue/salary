"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Rocket,
  ScrollText,
  ShieldCheck,
  Shuffle,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";

type RoleKey = "employee" | "manager" | "hr";

const ROLES: Array<{
  key: RoleKey;
  label: string;
  short: string;
  icon: LucideIcon;
  title: string;
  description: string;
  points: Array<{ icon: LucideIcon; text: string }>;
}> = [
  {
    key: "employee",
    label: "Salarié",
    short: "Salarié",
    icon: UserRound,
    title: "Votre fiche, comprise en un coup d'œil.",
    description: "Le net à payer en grand, la part des retenues en couleur, chaque ligne expliquée.",
    points: [
      { icon: Wallet, text: "Net, brut et retenues visualisés" },
      { icon: History, text: "Historique sur douze mois et évolution" },
      { icon: Download, text: "PDF, impression ou export CSV" },
    ],
  },
  {
    key: "manager",
    label: "Manager d'agence",
    short: "Manager",
    icon: Building2,
    title: "De l'Excel à la publication, guidé pas à pas.",
    description: "Un parcours en six étapes, un contrôle qualité visuel et une revue des destinataires avant d'envoyer.",
    points: [
      { icon: Upload, text: "Glisser-déposer du fichier de paie" },
      { icon: Shuffle, text: "Colonnes inconnues classées une seule fois" },
      { icon: Rocket, text: "Publication confirmée et emails envoyés" },
    ],
  },
  {
    key: "hr",
    label: "RH centrale",
    short: "RH",
    icon: ShieldCheck,
    title: "Toutes les agences, un seul tableau de bord.",
    description: "Masse salariale par période, répartition par agence, journal d'audit et exports en quelques clics.",
    points: [
      { icon: BarChart3, text: "Analyses consolidées multi-agences" },
      { icon: ScrollText, text: "Journal d'audit des actions sensibles" },
      { icon: FileSpreadsheet, text: "Exports CSV, Excel et PDF" },
    ],
  },
];

/**
 * Interactive "one platform, three spaces" showcase. Accessible tabs (arrow
 * keys, Home/End) swap a live-looking mock of each role's screen.
 */
export function RoleShowcase() {
  const [active, setActive] = useState<RoleKey>("employee");
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const role = ROLES.find((item) => item.key === active) ?? ROLES[0]!;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = ROLES.findIndex((item) => item.key === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ROLES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + ROLES.length) % ROLES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ROLES.length - 1;
    else return;
    event.preventDefault();
    setActive(ROLES[next]!.key);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mt-12">
      <div
        aria-label="Choisissez un espace"
        className="no-scrollbar mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-sm)]"
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {ROLES.map((item, index) => {
          const selected = item.key === active;
          return (
            <button
              aria-controls={`${baseId}-panel`}
              aria-selected={selected}
              className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              id={`${baseId}-${item.key}`}
              key={item.key}
              onClick={() => setActive(item.key)}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <item.icon className="size-4" aria-hidden="true" />
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`${baseId}-${active}`}
        className="mt-10 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        <div className="fade-up max-w-lg" key={`text-${active}`}>
          <h3 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">{role.title}</h3>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{role.description}</p>
          <ul className="mt-7 grid gap-3">
            {role.points.map((point) => (
              <li className="flex items-center gap-3" key={point.text}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground">
                  <point.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="fade-up relative" key={`mock-${active}`} aria-hidden="true">
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-teal/15 via-accent/10 to-primary/15 blur-2xl" />
          <div className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-[var(--shadow-glow)]">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="size-2.5 rounded-full bg-danger/60" />
              <span className="size-2.5 rounded-full bg-warning/60" />
              <span className="size-2.5 rounded-full bg-success/60" />
              <span className="ml-3 rounded-md bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                madajobpay · {role.label.toLowerCase()}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              {active === "employee" ? <EmployeeMock /> : active === "manager" ? <ManagerMock /> : <HrMock />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeMock() {
  const months = [62, 70, 66, 74, 71, 80];
  return (
    <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
      <div className="brand-gradient rounded-2xl p-4 text-primary-foreground">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">Net à payer</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">1 096 500 Ar</p>
        <div className="mt-4 flex items-center gap-3">
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(0 0% 100% / 0.15)" strokeWidth="5" />
            <circle className="donut-seg" cx="18" cy="18" r="14" fill="none" pathLength={100} stroke="hsl(var(--accent))" strokeWidth="5" strokeDasharray="88 12" />
          </svg>
          <div className="text-xs">
            <p className="font-semibold">88 % du brut</p>
            <p className="text-primary-foreground/70">12 % de retenues</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border p-4">
        <p className="text-xs font-semibold">Évolution du net</p>
        <div className="mt-3 flex h-24 items-end gap-1.5">
          {months.map((value, index) => (
            <span
              className={`chart-col flex-1 rounded-t-md ${index === months.length - 1 ? "bg-gradient-to-b from-teal to-primary" : "bg-primary/25"}`}
              key={index}
              style={{ height: `${value}%`, animationDelay: `${index * 60}ms` }}
            />
          ))}
        </div>
      </div>
      <ul className="grid gap-2 sm:col-span-2">
        {[
          ["Salaire de base", "1 250 000", 92, false],
          ["Prime d'ancienneté", "85 000", 22, false],
          ["Cotisations sociales", "− 142 000", 30, true],
        ].map(([label, amount, width, negative]) => (
          <li className="grid gap-1.5" key={String(label)}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-semibold tabular-nums ${negative ? "text-danger" : ""}`}>{amount} Ar</span>
            </div>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={`chart-bar block h-full rounded-full ${negative ? "bg-danger/60" : "bg-gradient-to-r from-primary to-teal"}`} style={{ width: `${width}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManagerMock() {
  const steps = [Upload, Shuffle, ShieldCheck, FileText, Eye, Rocket];
  return (
    <div className="grid gap-4">
      <div className="relative flex items-center justify-between">
        <span className="absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <span className="chart-bar absolute left-4 top-1/2 h-1 w-[70%] -translate-y-1/2 rounded-full bg-gradient-to-r from-success to-primary" />
        {steps.map((Icon, index) => (
          <span
            className={`relative flex size-9 items-center justify-center rounded-full border-4 border-surface ${
              index < 4 ? "bg-success text-primary-foreground" : index === 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
            key={index}
          >
            {index < 4 ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
          </span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
          <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
            <circle className="donut-seg" cx="18" cy="18" r="14" fill="none" pathLength={100} stroke="hsl(var(--success))" strokeWidth="4" strokeLinecap="round" strokeDasharray="95 5" />
          </svg>
          <div>
            <p className="font-display text-xl font-bold">95 %</p>
            <p className="text-xs text-muted-foreground">lignes valides</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["42", "valides", "text-success"], ["2", "erreurs", "text-danger"], ["0", "inconnus", "text-muted-foreground"]].map(([value, label, tone]) => (
            <div className="rounded-2xl border border-border p-3" key={label}>
              <p className={`font-display text-lg font-bold ${tone}`}>{value}</p>
              <p className="text-[0.65rem] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent/12 p-3">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="size-4 text-success" />
          42 destinataires vérifiés
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-foreground">
          <Rocket className="size-3.5" /> Publier
        </span>
      </div>
    </div>
  );
}

function HrMock() {
  const periods = [55, 64, 72, 70, 81, 88];
  const agencies: Array<[string, number, string]> = [
    ["Antananarivo", 86, "bg-primary"],
    ["Toamasina", 42, "bg-teal"],
    ["Mahajanga", 24, "bg-accent"],
  ];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        {[["128", "salariés"], ["3", "agences"], ["100 %", "publiés"]].map(([value, label]) => (
          <div className="rounded-2xl border border-border p-3" key={label}>
            <p className="font-display text-lg font-bold">{value}</p>
            <p className="text-[0.65rem] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold">Masse nette / période</p>
          <div className="mt-3 flex h-24 items-end gap-1.5">
            {periods.map((value, index) => (
              <span
                className={`chart-col flex-1 rounded-t-md ${index === periods.length - 1 ? "bg-gradient-to-b from-teal to-primary" : "bg-teal/30"}`}
                key={index}
                style={{ height: `${value}%`, animationDelay: `${index * 60}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="grid content-start gap-3 rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold">Par agence</p>
          {agencies.map(([name, width, color]) => (
            <div className="grid gap-1" key={name}>
              <span className="text-[0.68rem] text-muted-foreground">{name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className={`chart-bar block h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
