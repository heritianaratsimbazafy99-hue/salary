"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
export function AgencyInvitationButton({ employeeIds }: { employeeIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const operation = useRef<string | null>(null);
  async function send() {
    setBusy(true); setMessage("");
    operation.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/manager/employees/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeIds, idempotencyKey: operation.current }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Envoi impossible.");
      setMessage(`${body.data.sent} invitation(s) envoyée(s), ${body.data.pending} en attente de traitement, ${body.data.failed} en échec récupérable, ${body.data.skipped} ignorée(s) (déjà activé, départ ou délai de renvoi).`);
      if (body.data.failed === 0) operation.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erreur réseau. Vous pouvez réessayer."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-2"><p className="text-sm text-muted-foreground">Confirmez l’envoi aux {employeeIds.length} salarié(s) sélectionné(s) dont l’adresse affichée est correcte. Aucune fiche n’est requise.</p><Button type="button" disabled={busy || !employeeIds.length} onClick={send}>{busy ? "Envoi…" : "Confirmer et envoyer les invitations"}</Button>{message && <p role="status" className="text-sm">{message}</p>}</div>;
}
