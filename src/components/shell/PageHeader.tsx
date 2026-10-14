import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Optional actions rendered on the right of the title row (desktop). */
  actions?: ReactNode;
  /** Large glyph shown in the banner. */
  icon?: LucideIcon;
  /** Optional strip rendered under the title (e.g. key figures). */
  children?: ReactNode;
};

/**
 * Page-level hero banner used across the internal app surfaces: brand gradient,
 * oversized icon, title and the page's primary actions. Gives every screen an
 * immediately recognisable "where am I / what can I do here" header.
 */
export function PageHeader({ eyebrow, title, description, actions, icon: Icon, children }: PageHeaderProps) {
  return (
    <header className="brand-gradient fade-up relative isolate overflow-hidden rounded-[1.75rem] px-5 py-6 text-primary-foreground shadow-[var(--shadow-lg)] sm:px-8 sm:py-8">
      {/* Decorative rings */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 size-72 rounded-full border-[28px] border-primary-foreground/[0.06]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 -z-10 size-56 rounded-full border-[18px] border-accent/15" />

      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {Icon ? (
            <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 text-accent shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)] backdrop-blur sm:flex">
              <Icon className="size-7" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-1 text-xs font-bold text-primary-foreground">
                <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-accent" />
                {eyebrow}
              </span>
            ) : null}
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-primary-foreground/80 [overflow-wrap:anywhere]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

/** Glassy figure chip for use inside PageHeader children. */
export function HeaderStat({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-2xl border border-primary-foreground/12 bg-primary-foreground/[0.08] px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3 ${className ?? ""}`}
    >
      {Icon ? (
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10 text-accent min-[420px]:flex">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-primary-foreground/70 sm:text-[0.68rem] sm:tracking-wider">{label}</p>
        <p className="truncate font-display text-base font-bold tabular-nums sm:text-lg">{value}</p>
      </div>
    </div>
  );
}
