import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { initialsOf } from "./format";
import { toneForName, toneText, toneTile, type Tone } from "./tones";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function IconTile({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "size-12 rounded-2xl" : size === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl";
  const glyph = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  return (
    <span className={cx("flex shrink-0 items-center justify-center", box, toneTile[tone], className)}>
      <Icon className={glyph} aria-hidden="true" />
    </span>
  );
}

/**
 * Standard content card: optional icon + heading row, then body. Keeps every
 * section of the app on the same elevation, radius and spacing rhythm.
 */
export function Panel({
  title,
  titleId,
  description,
  icon,
  tone = "primary",
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  headingLevel = 2,
}: {
  title?: ReactNode;
  titleId?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <Tag
      aria-labelledby={titleId}
      className={cx(
        "min-w-0 rounded-3xl border border-border/80 bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
            {icon ? <IconTile icon={icon} tone={tone} /> : null}
            <div className="min-w-0">
              <Heading className="font-display text-base font-semibold text-foreground sm:text-lg" id={titleId}>
                {title}
              </Heading>
              {description ? (
                <p className="mt-1 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cx("min-w-0", title ? "mt-5" : undefined, bodyClassName)}>{children}</div> : null}
    </Tag>
  );
}

/** KPI tile: icon, label, big figure and an optional hint / visual. */
export function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  hint,
  children,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: ReactNode;
  children?: ReactNode;
  /** Colour the figure with the tone (e.g. errors in red). */
  emphasis?: boolean;
}) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-3xl border border-border/80 bg-surface p-3.5 shadow-[var(--shadow-sm)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={icon} tone={tone} className="size-8 rounded-lg sm:size-10 sm:rounded-xl" />
        {children}
      </div>
      <p className="mt-3 text-[0.65rem] font-semibold uppercase leading-4 tracking-wide text-muted-foreground sm:mt-4 sm:text-xs">{label}</p>
      <p
        className={cx(
          "mt-1 font-display text-xl font-bold tabular-nums tracking-tight sm:text-2xl",
          emphasis ? toneText[tone] : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-8 text-[0.68rem]" : "size-10 text-xs";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-2 ring-surface",
        box,
        toneTile[toneForName(name)],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "primary",
  headingLevel = 2,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-surface/70 px-6 py-12 text-center">
      <span className="relative">
        <span aria-hidden="true" className={cx("absolute inset-0 animate-ping rounded-2xl opacity-20 motion-reduce:hidden", toneTile[tone])} />
        <IconTile icon={icon} tone={tone} size="lg" className="relative" />
      </span>
      <Heading className="mt-5 font-display text-lg font-semibold text-foreground">{title}</Heading>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Inline callout for guidance, warnings and confirmations. */
export function Callout({
  icon,
  tone = "primary",
  title,
  children,
  role,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  role?: "alert" | "status";
}) {
  const border: Record<Tone, string> = {
    primary: "border-primary/15 bg-primary/[0.05]",
    teal: "border-teal/20 bg-teal/[0.06]",
    accent: "border-accent/25 bg-accent/[0.08]",
    amber: "border-amber/25 bg-amber/[0.08]",
    danger: "border-danger/20 bg-danger/[0.06]",
    success: "border-success/20 bg-success/[0.07]",
    neutral: "border-border bg-muted/50",
  };
  return (
    <div role={role} className={cx("flex items-start gap-3 rounded-2xl border px-4 py-3.5", border[tone])}>
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 text-sm leading-6 text-foreground">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "text-muted-foreground" : undefined}>{children}</div>
      </div>
    </div>
  );
}
