import type { Metadata } from "next";
import Link from "next/link";

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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
        <BrandLogo markSize={36} href={null} priority />
        <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-primary">Bienvenue dans votre espace salarié</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Activer mon compte</h1>
        {state === "pending" ? (
          <>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Confirmez l’adresse email qui a reçu votre invitation. Nous vous enverrons un lien sécurisé pour activer votre accès à vos fiches de paie, sans mot de passe.
            </p>
            <ActivationForm token={token} />
          </>
        ) : (
          <p role="alert" className="mt-6 rounded-xl border border-border bg-background p-4 text-sm leading-6">
            {state === "expired"
              ? "Cette invitation a expiré. Demandez une nouvelle invitation à votre responsable."
              : state === "load_failed"
                ? "Impossible de vérifier votre invitation pour le moment. Actualisez cette page dans quelques instants."
                : callbackFailed
                  ? "Le lien de vérification a expiré, a déjà été utilisé ou a été ouvert dans un autre navigateur. Rouvrez votre email d’invitation initial et demandez un nouveau lien sur cet appareil. Si le problème persiste, contactez votre responsable."
                  : "Cette invitation n’est plus disponible ou a déjà été utilisée. Si votre compte est activé, connectez-vous. Sinon, demandez une nouvelle invitation à votre responsable."}
          </p>
        )}
        <Link className="mt-7 inline-block text-sm font-medium text-primary underline underline-offset-4" href="/auth/login">
          Retour à la connexion
        </Link>
      </section>
    </main>
  );
}
