"use client";

import { useState, useSyncExternalStore } from "react";
import { MailPlus, Loader2 } from "lucide-react";

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
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal/12 text-teal"><MailPlus className="size-5" aria-hidden="true" /></span>
        <p className="font-display text-sm font-semibold">Invitations en attente</p>
      </div>
      <p className="max-w-lg text-sm leading-6 text-muted-foreground">Pour les salariés qui n’ont pas encore activé leur compte. Les anciens liens seront remplacés.</p>
      <Button className="mt-auto" disabled={!isHydrated || isSending} onClick={resend} variant="secondary">
        {isSending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isSending ? "Envoi en cours…" : "Renvoyer les invitations"}
      </Button>
      {message ? <p className={`max-w-lg rounded-xl px-3 py-2 text-sm leading-6 ${hasError ? "bg-danger/[0.06] text-danger" : "bg-success/[0.07] text-foreground"}`} role={hasError ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
