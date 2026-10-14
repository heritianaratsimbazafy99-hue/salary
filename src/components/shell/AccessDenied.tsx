import Link from "next/link";
import { ArrowLeft, LifeBuoy, ShieldAlert } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { buttonClasses } from "@/components/ui/Button";

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
    <main className="app-canvas flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="fade-up w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-surface text-center shadow-[var(--shadow-lg)]">
        <div className="relative bg-danger/[0.06] px-6 pb-8 pt-10">
          <div aria-hidden="true" className="absolute left-1/2 top-8 size-28 -translate-x-1/2 rounded-full bg-danger/10 blur-2xl" />
          <span className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-surface text-danger shadow-[var(--shadow-md)]">
            <ShieldAlert className="size-8" aria-hidden="true" />
          </span>
          <p className="relative mt-5 inline-flex rounded-full bg-surface px-3 py-1 text-xs font-bold text-primary shadow-[var(--shadow-xs)]">
            {context}
          </p>
        </div>
        <div className="px-6 pb-8 pt-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">Acces refuse</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link className={buttonClasses({ variant: "primary" })} href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à l&apos;accueil
            </Link>
            <Link className={buttonClasses({ variant: "secondary" })} href="/auth/login">
              <LifeBuoy className="size-4" aria-hidden="true" />
              Changer de compte
            </Link>
          </div>
          <div className="mt-8 flex justify-center opacity-80">
            <BrandLogo markSize={26} />
          </div>
        </div>
      </section>
    </main>
  );
}
