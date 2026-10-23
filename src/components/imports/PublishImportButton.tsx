"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Loader2, Rocket, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { InvitationConfirmation } from "./InvitationConfirmation";
import { PublicationReviewSchema, type PublicationReview } from "@/lib/payroll/manager-review";
const subscribe = () => () => {};

export function PublishImportButton({ importId }: { importId: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [review, setReview] = useState<PublicationReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (review) dialogRef.current?.showModal(); }, [review]);
  async function requestReview() {
    setBusy(true); setError(""); setConfirmed(false);
    try {
      const response = await fetch(`/api/imports/${importId}/review`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Revue impossible.");
      setReview(PublicationReviewSchema.parse(payload.data));
    } catch (error) { setError(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!review || !confirmed) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/imports/${importId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, fingerprint: review.fingerprint }) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setReview(null); setConfirmed(false); }
        throw new Error(payload.error?.message ?? "Publication impossible.");
      }
      window.location.reload();
    } catch (error) { setError(error instanceof Error ? error.message : "Erreur réseau."); setBusy(false); }
  }
  return <div className="grid gap-2">
    <Button disabled={!hydrated || busy} onClick={requestReview} size="lg" type="button" variant="accent">
      {busy && !review ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Rocket className="size-4" aria-hidden="true" />}
      {busy ? "Chargement…" : "Publier"}
    </Button>
    {review ? <dialog ref={dialogRef} onCancel={(event) => { if (busy) event.preventDefault(); else { setReview(null); setConfirmed(false); } }} aria-labelledby="publication-title" className="dialog-pop fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-[1.75rem] border border-border bg-surface p-0 text-foreground shadow-[var(--shadow-lg)]">
      <div className="brand-gradient flex items-start justify-between gap-4 px-6 py-5 text-primary-foreground">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/12 text-accent"><Rocket className="size-5" aria-hidden="true" /></span>
          <div>
            <h2 id="publication-title" className="font-display text-xl font-semibold">Vérifier avant publication</h2>
            <p className="text-sm text-primary-foreground/75">Dernier contrôle avant la mise en ligne des fiches.</p>
          </div>
        </div>
        <button type="button" disabled={busy} onClick={() => { setReview(null); setConfirmed(false); }} className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground" aria-label="Fermer la vérification"><X className="size-5" aria-hidden="true" /></button>
      </div>
      <div className="grid gap-5 p-6">
        <InvitationConfirmation candidates={review.recipients} />
        {review.recipients.some(r => r.nameDiffers) && <p role="status">Des noms diffèrent du dossier salarié. Le nom du dossier sera conservé ; les fiches utiliseront le nom de la source de paie.</p>}
        {review.recipients.some(r => r.departed) && <div role="status"><p>Salariés partis : validation RH obligatoire pour cette version avant publication. Aucun emploi ni accès ne sera réactivé.</p><ul>{review.recipients.filter(r => r.departed).map(r => <li key={r.employeeId}>{r.employeeName} · {r.employeeId}</li>)}</ul><a className="underline" href={`/hr/payroll-departure-review/${importId}`}>Lien de revue à transmettre aux RH</a></div>}
        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm font-medium transition-colors ${confirmed ? "border-success/40 bg-success/[0.06]" : "border-border bg-surface-elevated hover:border-primary/30"}`}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-5 accent-[hsl(var(--primary))]" />Je confirme les destinataires et la publication de toutes les fiches valides.</label>
        <p className="flex items-start gap-2.5 rounded-2xl bg-amber/10 px-4 py-3 text-sm leading-6 text-amber-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Les fiches publiées ne seront plus modifiables. Une correction ultérieure exige un nouvel import.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setReview(null); setConfirmed(false); }}>Annuler</Button><Button type="button" disabled={!confirmed || busy || review.recipients.length === 0} onClick={publish}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Rocket className="size-4" aria-hidden="true" />}Confirmer la publication</Button></div>
        {error ? <p role="alert" className="rounded-xl bg-danger/[0.06] px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
    </dialog> : null}
    {error && !review ? <p role="alert" className="max-w-xs rounded-xl bg-danger px-3 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-sm)]">{error}</p> : null}
  </div>;
}
