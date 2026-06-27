"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";

const NAV = [
  { href: "#parcours", label: "Comment ça marche" },
  { href: "#securite", label: "Sécurité" },
  { href: "#equipes", label: "RH & managers" },
];

/**
 * Marketing header. Stays transparent over the hero, then condenses into a
 * frosted bar once the page scrolls — a small, premium "settle" on scroll.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40">
      <div
        className={`mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 transition-all duration-300 sm:px-6 ${
          scrolled
            ? "mt-2 rounded-2xl border border-border/70 bg-surface/80 px-4 shadow-[var(--shadow-sm)] backdrop-blur-xl sm:mx-auto sm:w-[min(100%-1.5rem,80rem)]"
            : "border border-transparent"
        }`}
      >
        <BrandLogo subtitle="Espace salarié" priority />
        <nav
          aria-label="Sections"
          className="hidden items-center gap-1 text-sm font-medium text-muted-foreground md:flex"
        >
          {NAV.map((item) => (
            <a
              key={item.href}
              className="rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition hover:bg-primary-strong hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href="/auth/login"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Connexion
        </Link>
      </div>
    </header>
  );
}
