import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  /** Optional line under the wordmark, e.g. "Espace salarié". */
  subtitle?: string;
  /** Use light text for placement on the dark `--ink` surface. */
  inverted?: boolean;
  /** Wrap in a link. Pass null to render inline (e.g. inside a mock window). */
  href?: string | null;
  /** Edge length of the logo mark in px. */
  markSize?: number;
  /** Hint the loader this is above the fold. */
  priority?: boolean;
  /** Hide the "MadajobPay" wordmark, showing only the mark. */
  markOnly?: boolean;
  className?: string;
};

/**
 * Official MadajobPay brand lockup: the Madajob mark + the "MadajobPay"
 * wordmark, with "Pay" tinted in the platform primary. Single source of truth
 * so the logo stays identical across the marketing site, app shell and login.
 */
export function BrandLogo({
  subtitle,
  inverted = false,
  href = "/",
  markSize = 40,
  priority = false,
  markOnly = false,
  className,
}: BrandLogoProps) {
  const content = (
    <>
      <span
        className="relative shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5"
        style={{ width: markSize, height: markSize }}
      >
        <Image
          src="/madajob-logo.png"
          alt={markOnly ? "MadajobPay" : ""}
          fill
          sizes={`${markSize}px`}
          priority={priority}
          className="object-contain"
        />
      </span>
      {markOnly ? null : (
        <span className="leading-tight">
          <span
            className={`block font-display text-sm font-semibold tracking-tight ${
              inverted ? "text-ink-foreground" : "text-foreground"
            }`}
          >
            Madajob<span className={inverted ? "text-accent" : "text-primary"}>Pay</span>
          </span>
          {subtitle ? (
            <span className={`block text-xs ${inverted ? "text-ink-muted" : "text-muted-foreground"}`}>
              {subtitle}
            </span>
          ) : null}
        </span>
      )}
    </>
  );

  if (href === null) {
    return <span className={`flex items-center gap-2.5 ${className ?? ""}`}>{content}</span>;
  }

  return (
    <Link
      href={href}
      aria-label="MadajobPay — accueil"
      className={`group flex items-center gap-2.5 ${className ?? ""}`}
    >
      {content}
    </Link>
  );
}
