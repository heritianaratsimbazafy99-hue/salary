"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";

export function RetryNotificationsButton({ importId }: { importId: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function retry() {
    setSending(true); setMessage(null); setError(false);
    try {
      const response = await fetch(`/api/imports/${importId}/notifications`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Reprise impossible.");
      const { sent, failed, skipped, remaining, unconfirmed } = payload.data;
      setError(failed > 0 || unconfirmed > 0);
      setMessage(`${sent} email(s) envoyé(s), ${failed} échec(s), ${skipped} accès inactif, non activé ou adresse modifiée. ${remaining} restant(s) : relancez ce bouton pour le lot suivant. ${unconfirmed} envoi(s) incertain(s) : contactez le support pour vérifier la livraison avant tout renvoi.`);
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Reprise impossible."); }
    finally { setSending(false); }
  }
  return <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber/15 text-amber-foreground"><BellRing className="size-5" aria-hidden="true" /></span>
      <p className="font-display text-sm font-semibold">Emails de notification</p>
    </div>
    <p className="max-w-lg text-sm leading-6 text-muted-foreground">Pour les comptes déjà activés, jusqu’à 20 emails par reprise. Les envois confirmés ne sont pas renvoyés.</p>
    <Button className="mt-auto" disabled={sending} onClick={retry} variant="secondary">{sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}{sending ? "Envoi en cours…" : "Réessayer les emails en échec"}</Button>
    {message ? <p className={`max-w-lg rounded-xl px-3 py-2 text-sm leading-6 ${error ? "bg-danger/[0.06] text-danger" : "bg-success/[0.07] text-foreground"}`} role={error ? "alert" : "status"}>{message}</p> : null}
  </div>;
}
