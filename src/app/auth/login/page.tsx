import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Fingerprint,
  History,
  Lock,
  Mail,
} from "lucide-react";
import { z } from "zod";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Reveal } from "@/components/marketing/Reveal";

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

const REASSURANCE: Array<{ title: string; description: string; icon: typeof Lock }> = [
  {
    title: "Sans mot de passe",
    description: "Un lien à usage unique, lié à votre adresse — rien à mémoriser.",
    icon: Fingerprint,
  },
  {
    title: "Strictement privé",
    description: "Vous n'accédez qu'à vos propres fiches de paie.",
    icon: Lock,
  },
  {
    title: "Historique complet",
    description: "Toutes vos fiches publiées, classées par période.",
    icon: History,
  },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const message = resolveMessage(params);

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 md:py-10">
      <section className="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-6xl items-stretch gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8">
        {/* Brand / reassurance panel */}
        <aside className="relative hidden overflow-hidden rounded-3xl border border-ink/30 bg-ink p-8 text-ink-foreground shadow-[var(--shadow-lg)] lg:flex lg:flex-col">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute -bottom-16 right-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <BrandLogo inverted markSize={36} priority />
            <Link
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink-foreground"
              href="/"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à l&apos;accueil
            </Link>
          </div>

          <div className="relative mt-auto max-w-md">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-[var(--shadow-sm)]">
              <Mail className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-accent">
              Espace salarié
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
              Un lien dans votre boîte mail, et vous y êtes.
            </h1>
            <p className="mt-5 text-sm leading-6 text-ink-muted">
              La connexion par lien magique ouvre votre espace personnel selon votre rôle — salarié,
              manager d&apos;agence ou RH centrale.
            </p>

            <ul className="mt-9 space-y-3">
              {REASSURANCE.map((item) => (
                <li className="flex items-start gap-3" key={item.title}>
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-foreground/[0.06] text-accent">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="block text-sm text-ink-muted">{item.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Form panel */}
        <div className="flex items-center justify-center">
          <Reveal className="animate-rise w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
            <Link
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              href="/"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Accueil
            </Link>

            <BrandLogo markOnly href={null} markSize={44} priority />
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Connexion à MadajobPay
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Saisissez votre adresse professionnelle. Nous vous envoyons un lien de connexion
              sécurisé.
            </p>

            {message ? (
              <p
                role={message.tone === "success" ? "status" : "alert"}
                className={
                  message.tone === "success"
                    ? "mt-6 flex items-start gap-2.5 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success"
                    : "mt-6 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"
                }
              >
                {message.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                <span>{message.text}</span>
              </p>
            ) : null}

            <form action={requestMagicLink} className="mt-7 space-y-5">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="email">
                  Email professionnel
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    autoComplete="email"
                    className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
                    id="email"
                    inputMode="email"
                    name="email"
                    placeholder="nom@entreprise.com"
                    required
                    type="email"
                  />
                </div>
              </div>
              <button
                className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                type="submit"
              >
                Recevoir mon lien de connexion
                <ArrowRight
                  className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </form>

            <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              Le lien est valable un court instant. Vous pouvez en demander un nouveau à tout moment.
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
