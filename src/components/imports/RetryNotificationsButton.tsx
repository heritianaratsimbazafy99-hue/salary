"use client";

import { useState } from "react";
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
  return <div className="grid gap-2">
    <Button disabled={sending} onClick={retry} variant="secondary">{sending ? "Envoi en cours…" : "Réessayer les emails en échec"}</Button>
    <p className="max-w-lg text-sm text-muted-foreground">Pour les comptes déjà activés, jusqu’à 20 emails par reprise. Les envois confirmés ne sont pas renvoyés.</p>
    {message ? <p className="max-w-lg text-sm" role={error ? "alert" : "status"}>{message}</p> : null}
  </div>;
}
