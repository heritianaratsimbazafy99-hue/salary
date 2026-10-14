import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  AtSign,
  CheckCircle2,
  Clock,
  FileText,
  Fingerprint,
  History,
  Lock,
  Mail,
  MailCheck,
  Sparkles,
} from "lucide-react";
import { z } from "zod";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Reveal } from "@/components/marketing/Reveal";

import { buildMagicLinkOtpOptions } from "@/lib/auth/magic-link";
import { magicLinkFailureCode } from "@/lib/auth/errors";
import { getPublicSupabaseConfig } from "@/lib/env.public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const LoginFormSchema = z.object({
  email: z.string().trim().email(),
});

const LOGIN_MESSAGES = {
  callback_failed: {
    tone: "error",
    text: "Le lien de connexion a expiré ou n’est plus valide.",
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
    text: "Impossible d’envoyer le lien pour le moment.",
  },
  otp_rate_limited: {
    tone: "error",
    text: "La limite temporaire d’envoi ou de demandes est atteinte. Si vous avez déjà reçu un lien, utilisez le dernier email. Sinon, patientez avant de réessayer. Si le blocage persiste, contactez votre responsable.",
  },
  callback_rate_limited: {
    tone: "error",
    text: "Le service de connexion reçoit trop de demandes. Patientez quelques minutes, puis demandez un nouveau lien depuis cette page et ouvrez-le dans ce navigateur. Cette erreur ne signifie pas que votre lien a expiré.",
  },
  sent: {
    tone: "success",
    text: "Lien envoyé. Vérifiez votre boîte mail.",
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
    redirect(`/auth/login?error=${magicLinkFailureCode(error)}`);
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

const FLOW: Array<{ label: string; icon: typeof Lock }> = [
  { label: "Votre email", icon: AtSign },
  { label: "Lien magique", icon: Sparkles },
  { label: "Vos fiches", icon: FileText },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const message = resolveMessage(params);
  const sent = message?.tone === "success";

  return (
    <main className="app-canvas min-h-dvh text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand / reassurance panel (desktop) */}
      <aside className="sidebar-surface relative hidden overflow-hidden p-10 text-ink-foreground lg:flex lg:flex-col xl:p-14">
        <div aria-hidden="true" className="aurora-blob -left-20 top-10 h-80 w-80 bg-teal/30" style={{ ["--aurora-dur" as string]: "22s" }} />
        <div aria-hidden="true" className="aurora-blob -bottom-24 right-0 h-80 w-80 bg-accent/20" style={{ ["--aurora-dur" as string]: "28s", animationDelay: "-8s" }} />

        <div className="relative flex items-center justify-between gap-4">
          <BrandLogo inverted markSize={38} priority />
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-ink-foreground/10 hover:text-ink-foreground"
            href="/"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
        </div>

        <div className="relative my-auto max-w-lg py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Espace salarié</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] xl:text-5xl">
            Un lien dans votre boîte mail, et vous y êtes.
          </h1>
          <p className="mt-5 text-base leading-7 text-ink-muted">
            La connexion par lien magique ouvre votre espace personnel selon votre rôle — salarié,
            manager d&apos;agence ou RH centrale.
          </p>

          {/* Animated flow: email → magic link → payslips */}
          <ol aria-label="Parcours de connexion" className="mt-10 flex items-center gap-3">
            {FLOW.map((step, index) => (
              <li className="flex items-center gap-3" key={step.label}>
                <span className="hero-chip flex flex-col items-center gap-2" style={{ animationDelay: `${0.2 + index * 0.25}s` }}>
                  <span
                    className={`flex size-14 items-center justify-center rounded-2xl shadow-[var(--shadow-md)] ${
                      index === 1 ? "bg-accent text-accent-foreground" : "bg-ink-foreground/10 text-ink-foreground"
                    }`}
                  >
                    <step.icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-ink-muted">{step.label}</span>
                </span>
                {index < FLOW.length - 1 ? (
                  <span aria-hidden="true" className="relative mb-6 h-0.5 w-10 overflow-hidden rounded-full bg-ink-foreground/15 xl:w-16">
                    <span className="hero-shimmer absolute inset-0" />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          <ul className="mt-12 grid gap-3">
            {REASSURANCE.map((item) => (
              <li className="flex items-start gap-3 rounded-2xl border border-ink-foreground/10 bg-ink-foreground/[0.04] p-4" key={item.title}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <item.icon className="size-5" aria-hidden="true" />
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
      <div className="flex min-h-dvh flex-col lg:min-h-0 lg:items-center lg:justify-center lg:p-10">
        {/* Mobile brand banner */}
        <div className="brand-gradient relative overflow-hidden px-5 pb-16 pt-5 text-primary-foreground lg:hidden">
          <div aria-hidden="true" className="absolute -right-12 -top-12 size-48 rounded-full border-[22px] border-primary-foreground/[0.07]" />
          <div className="relative flex items-center justify-between gap-3">
            <BrandLogo inverted markSize={32} />
            <Link className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary-foreground/80" href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Accueil
            </Link>
          </div>
          <div className="relative mt-8 flex items-center gap-2" aria-hidden="true">
            {FLOW.map((step, index) => (
              <span className="flex items-center gap-2" key={step.label}>
                <span className={`flex size-10 items-center justify-center rounded-xl ${index === 1 ? "bg-accent text-accent-foreground" : "bg-primary-foreground/12"}`}>
                  <step.icon className="size-5" />
                </span>
                {index < FLOW.length - 1 ? <span className="h-0.5 w-6 rounded-full bg-primary-foreground/25" /> : null}
              </span>
            ))}
          </div>
          <p className="relative mt-4 max-w-xs font-display text-2xl font-bold leading-tight">Vos fiches de paie, à un lien près.</p>
        </div>

        <Reveal className="animate-rise relative z-10 mx-4 -mt-10 mb-8 w-auto max-w-md self-stretch rounded-[1.75rem] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:mx-auto sm:w-full sm:p-8 lg:m-0 lg:self-center">
          {sent ? (
            <div className="mb-6 flex items-center gap-4 rounded-2xl bg-success/[0.07] p-4" aria-hidden="true">
              <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-success text-primary-foreground">
                <MailCheck className="size-7" />
                <span className="absolute inset-0 animate-ping rounded-2xl bg-success/30 motion-reduce:hidden" />
              </span>
              <span className="text-sm leading-6">
                <span className="block font-semibold text-foreground">Ouvrez votre boîte mail</span>
                <span className="block text-muted-foreground">Cliquez sur le lien reçu, depuis ce navigateur.</span>
              </span>
            </div>
          ) : (
            <BrandLogo markOnly href={null} markSize={48} priority />
          )}
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
                  className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  autoComplete="email"
                  className="h-13 w-full rounded-xl border border-border bg-background pl-11 pr-3 text-base outline-none transition placeholder:text-muted-foreground hover:border-primary/30 focus:border-primary focus:ring-4 focus:ring-primary/15"
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
              className="group inline-flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground shadow-[var(--shadow-md)] transition hover:-translate-y-px hover:bg-primary-strong hover:shadow-[var(--shadow-lg)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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

          <ul className="mt-6 grid gap-2 border-t border-border pt-5 lg:hidden">
            {REASSURANCE.map((item) => (
              <li className="flex items-center gap-3 text-sm" key={item.title}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-medium">{item.title}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </main>
  );
}
