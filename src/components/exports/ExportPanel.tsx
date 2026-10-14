"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CalendarRange, CheckCircle2, Download, FileBarChart, FileCheck2, Info } from "lucide-react";

import { ExportDownload } from "./ExportDownload";
import { Input, fieldClass } from "@/components/ui/Input";
import type { ExportType } from "@/lib/payroll/export";

const EXPORT_TYPES: Array<{ value: ExportType; title: string; description: string; icon: LucideIcon }> = [
  { value: "PUBLISHED_PAYSLIPS", title: "Fiches publiées", description: "Montants nets, bruts et retenues par salarié. PDF disponible.", icon: FileCheck2 },
  { value: "IMPORT_REPORT", title: "Rapport des imports", description: "Lignes importées, erreurs et statuts des fichiers.", icon: FileBarChart },
];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function ExportPanel({ agencies }: { agencies: Array<{ id: string; name: string }> }) {
  const [agencyId, setAgencyId] = useState("");
  const [exportType, setExportType] = useState<ExportType>("PUBLISHED_PAYSLIPS");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  function preset(kind: "lastMonth" | "quarter" | "year") {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    if (kind === "lastMonth") {
      setPeriodStart(isoDate(new Date(Date.UTC(y, m - 1, 1))));
      setPeriodEnd(isoDate(new Date(Date.UTC(y, m, 0))));
    } else if (kind === "quarter") {
      setPeriodStart(isoDate(new Date(Date.UTC(y, m - 3, 1))));
      setPeriodEnd(isoDate(new Date(Date.UTC(y, m, 0))));
    } else {
      setPeriodStart(isoDate(new Date(Date.UTC(y, 0, 1))));
      setPeriodEnd(isoDate(new Date(Date.UTC(y, 11, 31))));
    }
  }

  const agencyLabel = agencies.find((agency) => agency.id === agencyId)?.name ?? "Toutes les agences";
  const typeLabel = EXPORT_TYPES.find((type) => type.value === exportType)?.title ?? "";

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Préparer un export">
      <div className="grid gap-6 rounded-3xl border border-border/80 bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <Step number={1} title="Données à exporter">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Données à exporter">
            {EXPORT_TYPES.map((type) => {
              const selected = exportType === type.value;
              return (
                <label
                  className={`relative flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-all duration-200 ${
                    selected ? "border-primary bg-primary/[0.05] shadow-[var(--shadow-sm)]" : "border-border hover:border-primary/40"
                  }`}
                  key={type.value}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    name="export-type"
                    onChange={() => setExportType(type.value)}
                    type="radio"
                    value={type.value}
                  />
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <type.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{type.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{type.description}</span>
                  </span>
                  {selected ? <CheckCircle2 className="absolute right-3 top-3 size-5 text-primary" aria-hidden="true" /> : null}
                </label>
              );
            })}
          </div>
        </Step>

        <Step number={2} title="Périmètre">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">Agence<select className={fieldClass} value={agencyId} onChange={(event) => setAgencyId(event.target.value)}><option value="">Toutes les agences</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label>
            <Input type="date" label="Début de période (inclus)" name="export-period-start" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            <Input type="date" label="Fin de période (incluse)" name="export-period-end" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground"><CalendarRange className="size-3.5" aria-hidden="true" />Raccourcis :</span>
            {([["lastMonth", "Mois dernier"], ["quarter", "3 derniers mois"], ["year", "Année en cours"]] as const).map(([kind, label]) => (
              <button className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 font-semibold transition hover:border-primary/40 hover:bg-primary/[0.05]" key={kind} onClick={() => preset(kind)} type="button">{label}</button>
            ))}
            {periodStart || periodEnd ? <button className="min-h-9 cursor-pointer rounded-full px-3 font-semibold text-muted-foreground hover:bg-muted" onClick={() => { setPeriodStart(""); setPeriodEnd(""); }} type="button">Effacer</button> : null}
          </div>
        </Step>

        <Step number={3} title="Format et téléchargement">
          <ExportDownload agencyId={agencyId || undefined} exportType={exportType} periodStart={periodStart || undefined} periodEnd={periodEnd || undefined} allowPdf />
        </Step>
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-8">
        <div className="brand-gradient rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-md)]">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary-foreground/75"><Download className="size-4 text-accent" aria-hidden="true" />Votre export</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div><dt className="text-primary-foreground/70">Données</dt><dd className="font-semibold">{typeLabel}</dd></div>
            <div><dt className="text-primary-foreground/70">Agence</dt><dd className="flex items-center gap-1.5 font-semibold"><Building2 className="size-3.5" aria-hidden="true" />{agencyLabel}</dd></div>
            <div><dt className="text-primary-foreground/70">Période</dt><dd className="font-semibold tabular-nums">{periodStart || "…"} → {periodEnd || "…"}</dd></div>
          </dl>
        </div>
        <div className="flex gap-3 rounded-3xl border border-border bg-surface p-4 text-sm leading-6 text-muted-foreground">
          <Info className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>Seules les périodes entièrement comprises dans les dates choisies sont incluses. CSV et Excel : 5 000 lignes maximum. PDF : 100 fiches détaillées maximum. Les documents PDF sont destinés à un usage interne et ne constituent pas des bulletins légaux.</p>
        </div>
      </aside>
    </section>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="mb-4 flex items-center gap-3 font-display text-base font-semibold">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{number}</span>
        {title}
      </legend>
      <div className="min-w-0">{children}</div>
    </fieldset>
  );
}
