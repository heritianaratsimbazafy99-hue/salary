import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

type AccessDeniedProps = {
  /** Short context label, e.g. "Espace manager" or "Administration RH". */
  context: string;
  description?: string;
};

/**
 * Shared forbidden state. The "Acces refuse" heading text and default
 * description are relied on by page tests — keep them verbatim.
 */
export function AccessDenied({
  context,
  description = "Votre role ne permet pas d'ouvrir cette page.",
}: AccessDeniedProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-10">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-6 text-sm font-semibold text-primary">{context}</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Acces refuse</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <Link
        className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary-strong"
        href="/"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
