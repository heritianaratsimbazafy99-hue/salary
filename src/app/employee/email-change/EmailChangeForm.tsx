"use client";
import { useActionState } from "react";
import { emailChangeAction } from "./actions";
export function EmailChangeForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(emailChangeAction, { message: "" });
  return <form action={action} className="grid gap-3"><input type="hidden" name="requestId" value={requestId} /><div className="flex flex-wrap gap-3"><button className="rounded-lg border px-4 py-2" name="mode" value="start" disabled={pending}>Recevoir les confirmations</button><button className="rounded-lg border px-4 py-2" name="mode" value="finish" disabled={pending}>J’ai confirmé : finaliser</button></div><p role="status">{state.message}</p></form>;
}
