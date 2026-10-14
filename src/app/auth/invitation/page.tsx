import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, AtSign, FileText, MailCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { getInvitationAvailability, isInvitationToken } from "@/lib/employees/activation";

import { ActivationForm } from "./ActivationForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Activer mon espace salarié | MadajobPay",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> };

export default async function InvitationPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  let state = "unavailable";
  if (isInvitationToken(token)) {
    try {
      state = await getInvitationAvailability(token);
    } catch {
      state = "load_failed";
    }
  }
  const callbackFailed = typeof params.error === "string";
  const callbackRateLimited = params.error === "callback_rate_limited";

  const steps = [
    { label: "Confirmer l’email", icon: AtSign },
    { label: "Ouvrir le lien", icon: MailCheck },
    { label: "Accéder aux fiches", icon: FileText },
  ];

  return (
    <main className="app-canvas flex min-h-dvh items-center justify-center px-4 py-8 text-foreground sm:py-12">
      <section className="fade-up w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="brand-gradient relative overflow-hidden px-6 pb-7 pt-6 text-primary-foreground sm:px-8">
          <div aria-hidden="true" className="absolute -right-14 -top-14 size-48 rounded-full border-[22px] border-primary-foreground/[0.07]" />
          <BrandLogo markSize={34} href={null} priority inverted />
          <p className="relative mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Bienvenue dans votre espace salarié</p>
          <h1 className="relative mt-2 font-display text-3xl font-bold tracking-tight">Activer mon compte</h1>
          <ol aria-label="Étapes d’activation" className="relative mt-6 grid grid-cols-3 gap-2">
            {steps.map((step, index) => (
              <li className="flex flex-col items-center gap-1.5 text-center" key={step.label}>
                <span className={`flex size-11 items-center justify-center rounded-2xl ${index === 0 && state === "pending" ? "bg-accent text-accent-foreground shadow-[var(--shadow-md)]" : "bg-primary-foreground/12 text-primary-foreground"}`}>
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-[0.7rem] font-semibold leading-tight text-primary-foreground/85">{step.label}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="px-6 pb-8 pt-6 sm:px-8">
          {state === "pending" ? (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                Confirmez l’adresse email qui a reçu votre invitation. Nous vous enverrons un lien sécurisé pour activer votre accès à vos fiches de paie, sans mot de passe.
              </p>
              <ActivationForm token={token} />
            </>
          ) : (
            <p role="alert" className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/[0.08] p-4 text-sm leading-6">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-foreground" aria-hidden="true" />
              <span>
              {callbackRateLimited
                ? "Le service de connexion reçoit trop de demandes. Patientez quelques minutes, puis rouvrez le même email de confirmation dans ce navigateur. Cette erreur ne signifie pas que votre lien a expiré. Si le blocage persiste, contactez votre responsable."
                : state === "expired"
                ? "Cette invitation a expiré. Demandez une nouvelle invitation à votre responsable."
                : state === "load_failed"
                  ? "Impossible de vérifier votre invitation pour le moment. Actualisez cette page dans quelques instants."
                  : callbackFailed
                    ? "Le lien de vérification a expiré, a déjà été utilisé ou a été ouvert dans un autre navigateur. Rouvrez votre email d’invitation initial et demandez un nouveau lien sur cet appareil. Si le problème persiste, contactez votre responsable."
                    : "Cette invitation n’est plus disponible ou a déjà été utilisée. Si votre compte est activé, connectez-vous. Sinon, demandez une nouvelle invitation à votre responsable."}
              </span>
            </p>
          )}
          <Link className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:text-primary-strong" href="/auth/login">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour à la connexion
          </Link>
        </div>
      </section>
    </main>
  );
}
