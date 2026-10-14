import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="app-canvas flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="fade-up w-full max-w-md rounded-[1.75rem] border border-border bg-surface p-8 text-center shadow-[var(--shadow-lg)]">
        <BrandLogo markSize={30} className="justify-center" />
        <p className="mt-8 font-display text-7xl font-bold tracking-tight text-gradient">404</p>
        <span className="mx-auto mt-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileQuestion className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold">Page introuvable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cette page n&apos;existe pas ou n&apos;est plus disponible pour votre compte.
        </p>
        <Link className={buttonClasses({ className: "mt-7" })} href="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>
      </section>
    </main>
  );
}
