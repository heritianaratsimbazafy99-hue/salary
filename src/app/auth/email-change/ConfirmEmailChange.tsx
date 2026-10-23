"use client";
import { useActionState } from "react";
import { confirmEmailChange } from "./actions";
export function ConfirmEmailChange() {
  const [state, action, pending] = useActionState(confirmEmailChange, { message: "", completed: false });
  function submit(form: FormData) {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    form.set("requestId", fragment.get("request") ?? ""); form.set("token", fragment.get("token") ?? "");
    // No server receives the bearer proof until this explicit submission.
    action(form);
  }
  return <form action={submit} className="grid gap-4"><p>Confirmez uniquement si les RH ont demandé cette correction pour votre emploi. Cela ne crée aucun compte et ne transfère aucun document vers un autre compte.</p><button className="rounded-lg border px-4 py-2" disabled={pending || state.completed}>Confirmer ma nouvelle adresse</button><p role="status">{state.message || "Ouvrez le lien reçu à votre nouvelle adresse puis confirmez explicitement le changement."}</p></form>;
}
