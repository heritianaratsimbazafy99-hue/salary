"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  return <div className="space-y-3">
    <Button disabled={!hydrated || busy} onClick={requestReview} type="button">{busy ? "Chargement…" : "Publier"}</Button>
    {review ? <dialog ref={dialogRef} onCancel={(event) => { if (busy) event.preventDefault(); else { setReview(null); setConfirmed(false); } }} aria-labelledby="publication-title" className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-black/40"><h2 id="publication-title" className="mb-4 font-display text-xl font-semibold">Vérifier avant publication</h2><InvitationConfirmation candidates={review.recipients} /><label className="my-5 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-4" />Je confirme les destinataires et la publication de toutes les fiches valides.</label><p className="mb-4 text-sm text-muted-foreground">Les fiches publiées ne seront plus modifiables. Une correction ultérieure exige un nouvel import.</p><div className="flex flex-wrap gap-3"><Button type="button" disabled={!confirmed || busy || review.recipients.length === 0} onClick={publish}>Confirmer la publication</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { setReview(null); setConfirmed(false); }}>Annuler</Button></div>{error ? <p role="alert" className="mt-3 text-danger">{error}</p> : null}</dialog> : null}
    {error && !review ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
