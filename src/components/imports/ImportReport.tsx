import { AlertOctagon, CheckCircle2, CircleCheckBig, UserX } from "lucide-react";

import { ProgressRing } from "@/components/ui/Charts";
import { formatCount } from "@/components/ui/format";
import { Callout, Panel, StatCard } from "@/components/ui/Surface";

type ImportError = {
  rowNumber: number;
  fieldName: string;
  message: string;
};

type Props = {
  validRowCount: number;
  invalidRowCount: number;
  unknownEmployeeCount: number;
  errors: ImportError[];
};

/** Quality summary of an import: share of valid rows, counters and each error. */
export function ImportReport({ validRowCount, invalidRowCount, unknownEmployeeCount, errors }: Props) {
  const total = validRowCount + invalidRowCount + unknownEmployeeCount;
  const quality = total > 0 ? validRowCount / total : 0;

  return (
    <section className="grid gap-4" aria-label="Contrôle qualité">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <div className="flex items-center gap-5 rounded-3xl border border-border/80 bg-surface p-5 shadow-[var(--shadow-sm)]">
          <ProgressRing
            value={quality}
            tone={quality >= 0.95 ? "success" : quality >= 0.8 ? "amber" : "danger"}
            label={`${Math.round(quality * 100)} % des lignes sont valides.`}
          >
            <span className="font-display text-2xl font-bold tabular-nums">{Math.round(quality * 100)}%</span>
            <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">valides</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold">Qualité du fichier</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {total === 0
                ? "Aucune ligne analysée pour le moment."
                : errors.length === 0 && invalidRowCount + unknownEmployeeCount === 0
                  ? "Toutes les lignes sont exploitables."
                  : "Seules les lignes valides seront publiées."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Lignes valides" value={formatCount(validRowCount)} icon={CheckCircle2} tone="success" emphasis />
          <StatCard
            label="Lignes en erreur"
            value={formatCount(invalidRowCount)}
            icon={AlertOctagon}
            tone={invalidRowCount > 0 ? "danger" : "neutral"}
            emphasis={invalidRowCount > 0}
          />
          <StatCard
            label="Salaries inconnus"
            value={formatCount(unknownEmployeeCount)}
            icon={UserX}
            tone={unknownEmployeeCount > 0 ? "amber" : "neutral"}
            emphasis={unknownEmployeeCount > 0}
          />
        </div>
      </div>
      {errors.length > 0 ? (
        <Panel
          icon={AlertOctagon}
          tone="danger"
          title={`${errors.length} point(s) à corriger`}
          description="Corrigez ces lignes dans le fichier source puis importez-le à nouveau si elles doivent être publiées."
        >
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {errors.map((error, index) => (
              <li
                className="flex items-start gap-3 rounded-2xl border border-danger/15 bg-danger/[0.04] p-3.5"
                key={`${error.rowNumber}:${error.fieldName}:${error.message}:${index}`}
              >
                <span className="flex h-10 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-surface px-2 leading-none shadow-[var(--shadow-xs)]">
                  <span className="text-[0.58rem] font-bold uppercase tracking-wider text-muted-foreground">Ligne</span>
                  <span className="mt-0.5 font-display text-sm font-bold tabular-nums text-danger">{error.rowNumber}</span>
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-normal break-words text-sm font-semibold text-foreground">{error.message}</span>
                  <span className="mt-1 inline-flex rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground ring-1 ring-border">
                    {error.fieldName}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Callout icon={CircleCheckBig} tone="success">
          Aucune erreur detectee.
        </Callout>
      )}
    </section>
  );
}
