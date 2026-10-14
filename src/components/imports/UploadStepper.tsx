import type { LucideIcon } from "lucide-react";
import { Check, Eye, FileUp, Mail, Rocket, ShieldCheck, Shuffle } from "lucide-react";

const STEPS: Array<{ label: string; hint: string; icon: LucideIcon }> = [
  { label: "Upload", hint: "Fichier Excel", icon: FileUp },
  { label: "Mapping", hint: "Colonnes", icon: Shuffle },
  { label: "Validation", hint: "Contrôles", icon: ShieldCheck },
  { label: "Invitations", hint: "Destinataires", icon: Mail },
  { label: "Previsualisation", hint: "Vérification", icon: Eye },
  { label: "Publication", hint: "Mise en ligne", icon: Rocket },
];

/**
 * Six-step progress for a payroll import. Desktop shows every label with a
 * connecting track; mobile shows the icons plus an explicit "step x of 6"
 * caption so the current position is always clear.
 */
export function UploadStepper({ currentStep, bare = false }: { currentStep: number; bare?: boolean }) {
  const done = Math.min(currentStep, STEPS.length - 1);
  const progress = (done / (STEPS.length - 1)) * 100;
  const current = STEPS[Math.min(currentStep, STEPS.length - 1)];

  return (
    <div className={bare ? "" : "rounded-3xl border border-border/80 bg-surface p-4 shadow-[var(--shadow-sm)] sm:p-6"}>
      <div aria-hidden="true" className="mb-4 flex items-center justify-between gap-3 sm:hidden">
        <p className="text-sm font-semibold">
          Étape {Math.min(currentStep + 1, STEPS.length)} sur {STEPS.length}
          <span className="text-muted-foreground"> · {current?.label}</span>
        </p>
        <span className="text-xs font-semibold text-primary">{Math.round(progress)} %</span>
      </div>
      <ol aria-label="Progression import" className="relative grid grid-cols-6">
        {/* Track */}
        <span aria-hidden="true" className="absolute left-[8.33%] right-[8.33%] top-5 h-1 rounded-full bg-muted" />
        <span
          aria-hidden="true"
          className="chart-bar absolute left-[8.33%] top-5 h-1 rounded-full bg-gradient-to-r from-success via-teal to-primary"
          style={{ width: `${(progress / 100) * 83.34}%` }}
        />
        {STEPS.map((step, index) => {
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          const Icon = isDone ? Check : step.icon;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center text-center"
              key={step.label}
            >
              <span
                className={[
                  "relative z-10 flex size-11 items-center justify-center rounded-full border-4 border-surface transition-all duration-300",
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                    : isDone
                      ? "bg-success text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="size-4" aria-hidden="true" />
                {isCurrent ? (
                  <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/25 motion-reduce:hidden" />
                ) : null}
              </span>
              <span
                className={`mt-2 hidden max-w-full truncate text-xs font-semibold sm:block ${
                  isCurrent ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
              <span className="hidden text-[0.68rem] text-muted-foreground lg:block" aria-hidden="true">
                {isDone ? "Terminé" : isCurrent ? "En cours" : step.hint}
              </span>
              <span className="sr-only sm:hidden">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
