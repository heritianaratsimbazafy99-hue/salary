"use client";

import { useState, type FormEvent } from "react";

import { ArrowRight, CheckCircle2, Columns3, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Input";
import { PAY_ITEM_CATEGORIES } from "@/lib/payroll/schema";

const CATEGORY_LABELS: Record<string, string> = {
  BASE_PAY: "Salaire de base",
  HOURS: "Heures",
  OVERTIME: "Heures supplémentaires",
  BONUS: "Prime",
  ABSENCE: "Absence",
  DEDUCTION: "Retenue",
  BENEFIT: "Avantage / indemnité",
  INFORMATIONAL_NOTE: "Note informative",
  OTHER_ELEMENTS: "Autre élément",
};

type Props = {
  importId: string;
  unknownColumns: string[];
};

export function ColumnMappingForm({ importId, unknownColumns }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (unknownColumns.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-success/[0.07] px-4 py-3 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Toutes les colonnes sont reconnues.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setHasError(false);

    const formData = new FormData(event.currentTarget);
    const mappings = unknownColumns.map((column, index) => ({
      displayLabel: String(formData.get(`mappings.${index}.displayLabel`) ?? column),
      sourceColumn: column,
      targetCategory: String(formData.get(`mappings.${index}.targetCategory`) ?? "OTHER_ELEMENTS"),
    }));

    let shouldReactivate = true;

    try {
      const response = await fetch(`/api/imports/${importId}/mappings`, {
        body: JSON.stringify({ mappings }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: unknown } }
        | null;

      if (!response.ok) {
        setHasError(true);
        setMessage(typeof payload?.error?.message === "string" ? payload.error.message : "Mapping impossible.");
        return;
      }

      shouldReactivate = false;
      window.location.assign(`/manager/imports/${importId}`);
    } catch {
      setHasError(true);
      setMessage("Erreur reseau. Verifiez votre connexion puis reessayez.");
    } finally {
      if (shouldReactivate) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {unknownColumns.map((column, index) => {
        const labelId = `mapping-${index}-label`;
        const categoryId = `mapping-${index}-category`;
        const fieldName = `mappings.${index}`;

        return (
          <fieldset
            aria-label={`Colonne ${column}`}
            key={column}
            className="grid min-w-0 items-end gap-3 rounded-2xl border border-border bg-surface-elevated p-4 md:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <input name={`${fieldName}.sourceColumn`} type="hidden" value={column} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colonne du fichier</p>
              <p className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 font-mono text-sm font-semibold text-amber-foreground">
                <Columns3 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{column}</span>
              </p>
            </div>
            <ArrowRight className="mb-3 hidden size-5 text-muted-foreground md:block" aria-hidden="true" />
            <label className="grid min-w-0 gap-2 text-sm font-medium" htmlFor={labelId}>
              Libelle
              <input
                className={fieldClass}
                defaultValue={column}
                id={labelId}
                name={`${fieldName}.displayLabel`}
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-medium" htmlFor={categoryId}>
              Categorie
              <select
                className={fieldClass}
                id={categoryId}
                name={`${fieldName}.targetCategory`}
                defaultValue="OTHER_ELEMENTS"
              >
                {PAY_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category] ?? category}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {isSubmitting ? "Enregistrement" : "Enregistrer les mappings"}
        </Button>
        {message ? (
          <p className={`text-sm ${hasError ? "text-danger" : "text-muted-foreground"}`} role={hasError ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
