import { Check } from "lucide-react";

const STEPS = ["Upload", "Mapping", "Validation", "Invitations", "Previsualisation", "Publication"];

export function UploadStepper({ currentStep }: { currentStep: number }) {
  return (
    <ol aria-label="Progression import" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {STEPS.map((step, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <li
            aria-current={isCurrent ? "step" : undefined}
            className={[
              "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
              isCurrent
                ? "border-primary/40 bg-primary/10 font-semibold text-primary shadow-[var(--shadow-xs)]"
                : isDone
                  ? "border-success/30 bg-success/[0.06] text-foreground"
                  : "border-border bg-surface text-muted-foreground",
            ].join(" ")}
            key={step}
          >
            <span
              className={[
                "flex size-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-success text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {isDone ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0 truncate">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
