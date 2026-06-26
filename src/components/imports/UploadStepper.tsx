const STEPS = ["Upload", "Mapping", "Validation", "Invitations", "Previsualisation", "Publication"];

export function UploadStepper({ currentStep }: { currentStep: number }) {
  return (
    <ol aria-label="Progression import" className="grid gap-2 md:grid-cols-6">
      {STEPS.map((step, index) => (
        <li
          aria-current={index === currentStep ? "step" : undefined}
          className="rounded border border-border px-3 py-2 text-sm"
          key={step}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}
