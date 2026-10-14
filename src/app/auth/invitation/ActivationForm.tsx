"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import { activateEmployee } from "./actions";

const MESSAGES: Record<string, string> = {
  sent: "Lien de vérification envoyé. Ouvrez-le dans ce même navigateur et sur cet appareil pour activer votre espace.",
  invalid_email: "Saisissez une adresse email valide.",
  email_mismatch: "Utilisez l’adresse email à laquelle votre invitation a été envoyée.",
  expired: "Cette invitation a expiré. Demandez une nouvelle invitation à votre responsable.",
  unavailable: "Cette invitation n’est plus disponible. Contactez votre responsable ou connectez-vous si votre compte est déjà activé.",
  send_failed: "L’envoi est temporairement indisponible. Patientez une minute puis réessayez.",
  rate_limited: "Un lien vient d’être demandé. Patientez une minute avant de réessayer, puis utilisez le dernier email reçu.",
};

export function ActivationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(activateEmployee, { status: "idle" });
  const message = MESSAGES[state.status];
  const unavailable = state.status === "expired" || state.status === "unavailable";

  return (
    <form action={action} className="mt-7 space-y-5">
      <input type="hidden" name="token" value={token} />
      {message ? (
        <p
          role={state.status === "sent" ? "status" : "alert"}
          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${state.status === "sent" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger"}`}
        >
          {message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="invitation-email">Email professionnel</label>
        <div className="relative">
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          autoComplete="email"
          placeholder="nom@entreprise.com"
          className="h-13 w-full rounded-xl border border-border bg-background pl-11 pr-3 text-base outline-none transition hover:border-primary/30 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60"
          id="invitation-email"
          name="email"
          type="email"
          maxLength={254}
          required
          disabled={pending || unavailable}
        />
        </div>
      </div>
      <button
        className="group inline-flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition hover:-translate-y-px hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={pending || unavailable}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Envoi en cours…" : state.status === "sent" ? "Renvoyer le lien de vérification" : "Recevoir mon lien d’activation"}
        {pending ? null : <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
      </button>
      <p className="text-xs leading-5 text-muted-foreground">
        Le lien est valable 15 minutes. Vérifiez aussi vos courriers indésirables. Chaque nouveau lien remplace le précédent.
      </p>
    </form>
  );
}
