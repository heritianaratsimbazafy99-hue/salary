"use client";
import { useState } from "react";
import { Calculator, Loader2, PencilLine, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { formatMga } from "@/components/ui/format";
import { fieldClass } from "@/components/ui/Input";

export type CorrectionRow = { id: string; employeeName: string; grossAmount: number; deductionsTotal: number; netAmount: number; notes?: string; updatedAt?: string };

export function ManualCorrectionForm({ row, importId }: { row: CorrectionRow; importId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [figures, setFigures] = useState({ gross: row.grossAmount, deductions: row.deductionsTotal, net: row.netAmount });
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/imports/${importId}/rows/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: row.updatedAt, reason: data.get("reason"), changes: { grossAmount: Number(data.get("grossAmount")), deductionsTotal: Number(data.get("deductionsTotal")), netAmount: Number(data.get("netAmount")), notes: data.get("notes") } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Correction impossible.");
      window.location.reload();
    } catch (error) { setError(error instanceof Error ? error.message : "Erreur réseau."); setBusy(false); }
  }
  const expectedNet = figures.gross - figures.deductions;
  const consistent = Math.abs(expectedNet - figures.net) < 0.005;
  const keys = { grossAmount: "gross", deductionsTotal: "deductions", netAmount: "net" } as const;

  return (
    <div>
      <Button
        aria-expanded={open}
        aria-label={`Corriger ${row.employeeName}`}
        disabled={!row.updatedAt}
        onClick={() => setOpen(!open)}
        size="sm"
        type="button"
        variant={open ? "ghost" : "secondary"}
      >
        {open ? <X className="size-4" aria-hidden="true" /> : <PencilLine className="size-4" aria-hidden="true" />}
        {open ? "Fermer" : "Corriger"}
      </Button>
      {open ? (
        <form onSubmit={save} className="fade-up mt-3 grid w-72 gap-3 whitespace-normal rounded-2xl border border-border bg-surface-elevated p-4 shadow-[var(--shadow-md)]">
          <p className="text-sm leading-6 text-muted-foreground">Correction des totaux et de la note. Pour modifier l’identité, la période ou les rubriques, corrigez le fichier et importez-le à nouveau.</p>
          {([{ key: "grossAmount", label: "Brut" }, { key: "deductionsTotal", label: "Retenues" }, { key: "netAmount", label: "Net" }] as const).map(({ key, label }) => (
            <label key={key} className="grid gap-1.5 text-sm font-medium">
              {label}
              <input
                className={fieldClass}
                name={key}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={key === "netAmount" ? undefined : 0}
                max={999999999999}
                required
                defaultValue={row[key]}
                onChange={(event) => setFigures((current) => ({ ...current, [keys[key]]: Number(event.target.value) }))}
              />
            </label>
          ))}
          <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-5 ${consistent ? "bg-success/[0.07] text-success" : "bg-amber/10 text-amber-foreground"}`}>
            <Calculator className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {consistent ? "Brut − retenues = net." : `Brut − retenues = ${formatMga(expectedNet)}. Vérifiez le net saisi.`}
          </p>
          <label className="grid gap-1.5 text-sm font-medium">Notes<textarea className={`${fieldClass} h-auto min-h-20 py-2`} name="notes" maxLength={1000} defaultValue={row.notes ?? ""} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Motif<textarea className={`${fieldClass} h-auto min-h-20 py-2`} name="reason" required minLength={5} maxLength={500} placeholder="Ex. : erreur de saisie validée par la RH" /></label>
          <Button disabled={busy} type="submit">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Enregistrer la correction
          </Button>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
