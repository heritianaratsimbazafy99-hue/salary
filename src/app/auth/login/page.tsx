import { redirect } from "next/navigation";
import { z } from "zod";

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
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
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
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
        <p className="text-sm font-medium text-primary">Plateforme paie</p>
        <h1 className="mt-3 text-3xl font-semibold">Connexion</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Recevez un lien de connexion securise sur votre adresse professionnelle.
        </p>

        {message ? (
          <p
            className={
              message.tone === "success"
                ? "mt-6 rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
                : "mt-6 rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground"
            }
          >
            {message.text}
          </p>
        ) : null}

        <form action={requestMagicLink} className="mt-8 space-y-5">
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-base outline-none focus:border-primary"
            id="email"
            name="email"
            placeholder="nom@entreprise.com"
            required
            type="email"
          />
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            type="submit"
          >
            Envoyer le lien
          </button>
        </form>
      </section>
    </main>
  );
}
