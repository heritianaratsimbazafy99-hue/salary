"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export function ResendInvitationsButton({ importId }: { importId: string }) {
  const [isSending, setIsSending] = useState(false);
  const isHydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  async function resend() {
    setIsSending(true);
    setMessage(null);
    setHasError(false);
    try {
      const response = await fetch(`/api/imports/${importId}/invitations`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Renvoi impossible.");
      const { sent, failed, skipped, unconfirmed = 0 } = payload.data;
      setHasError(failed > 0 || unconfirmed > 0);
      setMessage(`${sent} invitation(s) envoyée(s), ${failed} échec(s), ${skipped} non renvoyée(s) : compte déjà activé, inactif ou invitation envoyée il y a moins d’une minute. Vous pouvez réessayer après une minute.${unconfirmed ? ` ${unconfirmed} envoi(s) incertain(s) : les nouveaux liens restent valides. Contactez le support pour vérifier leur livraison avant tout renvoi.` : ""}`);
    } catch (error) {
      setHasError(true);
      setMessage(error instanceof Error ? error.message : "Renvoi impossible. Réessayez.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button disabled={!isHydrated || isSending} onClick={resend} variant="secondary">
        {isSending ? "Envoi en cours…" : "Renvoyer les invitations"}
      </Button>
      <p className="max-w-lg text-sm text-muted-foreground">Pour les salariés qui n’ont pas encore activé leur compte. Les anciens liens seront remplacés.</p>
      {message ? <p className={`max-w-lg text-sm ${hasError ? "text-danger" : "text-muted-foreground"}`} role={hasError ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
