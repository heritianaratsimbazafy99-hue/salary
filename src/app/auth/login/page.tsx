import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock, Mail, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { buildMagicLinkOtpOptions } from "@/lib/auth/magic-link";
import { getPublicSupabaseConfig } from "@/lib/env.public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const LoginFormSchema = z.object({
  email: z.string().trim().email(),
});

const LOGIN_MESSAGES = {
  callback_failed: {
    tone: "error",
    text: "Le lien de connexion a expire ou n'est plus valide.",
  },
  invalid_email: {
    tone: "error",
    text: "Saisissez une adresse email valide.",
  },
  missing_code: {
    tone: "error",
    text: "Le lien de connexion est incomplet.",
  },
  missing_config: {
    tone: "error",
    text: "La connexion est temporairement indisponible.",
  },
  otp_failed: {
    tone: "error",
    text: "Impossible d'envoyer le lien pour le moment.",
  },
  sent: {
    tone: "success",
    text: "Lien envoye. Verifiez votre boite mail.",
  },
} as const;

type LoginMessageKey = keyof typeof LOGIN_MESSAGES;

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    sent?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveMessage(params: Awaited<NonNullable<LoginPageProps["searchParams"]>>) {
  if (firstParam(params.sent) === "1") return LOGIN_MESSAGES.sent;

  const error = firstParam(params.error);
  if (error && error in LOGIN_MESSAGES) {
    return LOGIN_MESSAGES[error as LoginMessageKey];
  }

  return null;
}

async function requestMagicLink(formData: FormData) {
  "use server";

  const result = LoginFormSchema.safeParse({
    email: formData.get("email"),
  });

  if (!result.success) {
    redirect("/auth/login?error=invalid_email");
  }

  let appUrl: string;
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    appUrl = getPublicSupabaseConfig().appUrl;
    supabase = await createServerSupabaseClient();
  } catch {
    redirect("/auth/login?error=missing_config");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: buildMagicLinkOtpOptions(appUrl),
  });

  if (error) {
    redirect("/auth/login?error=otp_failed");
  }

  redirect("/auth/login?sent=1");
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const message = resolveMessage(params);

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground md:py-10">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="rounded-lg border border-border bg-foreground p-6 text-primary-foreground shadow-sm md:p-8">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/75 hover:text-primary-foreground"
            href="/"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour accueil
          </Link>
          <div className="mt-12 max-w-lg">
            <span className="inline-flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-accent">Connexion securisee</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
              Acces par lien magique, sans mot de passe a retenir.
            </h1>
            <p className="mt-5 text-sm leading-6 text-primary-foreground/75">
              Le lien ouvre votre espace selon votre role: manager d&apos;agence, RH centrale, super admin ou salarie.
            </p>
          </div>
          <div className="mt-10 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-primary-foreground/10 p-4">
              <Lock className="size-4 text-accent" aria-hidden="true" />
              <p className="mt-3 font-semibold">Session controlee</p>
              <p className="mt-1 text-primary-foreground/65">Acces lie a votre adresse professionnelle.</p>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-4">
              <Mail className="size-4 text-accent" aria-hidden="true" />
              <p className="mt-3 font-semibold">Email unique</p>
              <p className="mt-1 text-primary-foreground/65">Un nouveau lien peut etre genere a chaque connexion.</p>
            </div>
          </div>
        </aside>

        <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl shadow-foreground/5 md:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Salary</p>
          <h2 className="mt-3 text-3xl font-semibold">Connexion</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Recevez un lien de connexion securise sur votre adresse professionnelle.
          </p>

          {message ? (
            <p
              className={
                message.tone === "success"
                  ? "mt-6 rounded-md border border-success/25 bg-success/10 px-4 py-3 text-sm text-success"
                  : "mt-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
              }
            >
              {message.text}
            </p>
          ) : null}

          <form action={requestMagicLink} className="mt-8 space-y-5">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email professionnel
              </label>
              <input
                autoComplete="email"
                className="h-12 w-full rounded-md border border-border bg-background px-3 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="email"
                name="email"
                placeholder="nom@entreprise.com"
                required
                type="email"
              />
            </div>
            <button
              className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25"
              type="submit"
            >
              Envoyer le lien
            </button>
          </form>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Les liens doivent revenir vers l&apos;URL de production configuree dans Supabase Auth.
          </p>
        </div>
      </section>
    </main>
  );
}
