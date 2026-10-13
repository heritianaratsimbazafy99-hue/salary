"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
export type CorrectionRow = { id: string; employeeName: string; grossAmount: number; deductionsTotal: number; netAmount: number; notes?: string; updatedAt?: string };
export function ManualCorrectionForm({ row, importId }: { row: CorrectionRow; importId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <div><Button variant="secondary" type="button" onClick={() => setOpen(!open)} disabled={!row.updatedAt}>Corriger {row.employeeName}</Button>{open ? <form onSubmit={save} className="mt-3 grid min-w-60 gap-3 whitespace-normal"><p className="text-sm">Correction des totaux et de la note. Pour modifier l’identité, la période ou les rubriques, corrigez le fichier et importez-le à nouveau.</p>{([{ key: "grossAmount", label: "Brut" }, { key: "deductionsTotal", label: "Retenues" }, { key: "netAmount", label: "Net" }] as const).map(({ key, label }) => <label key={key} className="grid gap-1 text-sm">{label}<input className="rounded border border-border bg-surface p-2" name={key} type="number" step="0.01" min={key === "netAmount" ? undefined : 0} max={999999999999} required defaultValue={row[key]} /></label>)}<label className="grid gap-1 text-sm">Notes<textarea className="rounded border border-border bg-surface p-2" name="notes" maxLength={1000} defaultValue={row.notes ?? ""} /></label><label className="grid gap-1 text-sm">Motif<textarea className="rounded border border-border bg-surface p-2" name="reason" required minLength={5} maxLength={500} /></label><Button disabled={busy} type="submit">Enregistrer la correction</Button>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}</form> : null}</div>;
}
