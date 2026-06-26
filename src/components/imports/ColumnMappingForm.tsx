"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { PAY_ITEM_CATEGORIES } from "@/lib/payroll/schema";

type Props = {
  importId: string;
  unknownColumns: string[];
};

export function ColumnMappingForm({ importId, unknownColumns }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (unknownColumns.length === 0) {
    return <p className="text-sm text-muted-foreground">Toutes les colonnes sont reconnues.</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const mappings = unknownColumns.map((column, index) => ({
      displayLabel: String(formData.get(`mappings.${index}.displayLabel`) ?? column),
      sourceColumn: column,
      targetCategory: String(formData.get(`mappings.${index}.targetCategory`) ?? "OTHER_ELEMENTS"),
    }));

    const response = await fetch(`/api/imports/${importId}/mappings`, {
      body: JSON.stringify({ mappings }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setMessage("Mapping impossible.");
      setIsSubmitting(false);
      return;
    }

    window.location.assign(`/manager/imports/${importId}`);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {unknownColumns.map((column, index) => {
        const labelId = `mapping-${index}-label`;
        const categoryId = `mapping-${index}-category`;
        const fieldName = `mappings.${index}`;

        return (
          <fieldset key={column} className="grid gap-2 rounded border border-border p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-medium">{column}</legend>
            <input name={`${fieldName}.sourceColumn`} type="hidden" value={column} />
            <label className="text-sm" htmlFor={labelId}>
              Libelle
              <input
                className="mt-1 w-full rounded border border-border px-3 py-2"
                defaultValue={column}
                id={labelId}
                name={`${fieldName}.displayLabel`}
              />
            </label>
            <label className="text-sm" htmlFor={categoryId}>
              Categorie
              <select
                className="mt-1 w-full rounded border border-border px-3 py-2"
                id={categoryId}
                name={`${fieldName}.targetCategory`}
                defaultValue="OTHER_ELEMENTS"
              >
                {PAY_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
      <div className="flex items-center gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Enregistrement" : "Enregistrer les mappings"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </form>
  );
}
