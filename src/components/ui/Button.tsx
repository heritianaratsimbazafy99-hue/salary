import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary-strong hover:shadow-[var(--shadow-md)] hover:-translate-y-px",
  accent:
    "bg-accent text-accent-foreground shadow-[var(--shadow-sm)] hover:brightness-95 hover:shadow-[var(--shadow-md)] hover:-translate-y-px",
  secondary:
    "border border-border bg-surface text-foreground shadow-[var(--shadow-xs)] hover:border-primary/30 hover:bg-primary/[0.04]",
  ghost: "text-foreground hover:bg-muted",
  danger:
    "border border-danger/25 bg-danger/[0.06] text-danger hover:bg-danger/10 hover:border-danger/40",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

/** Shared visual contract for buttons and button-styled links. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return [
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold select-none",
    "transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-60",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  className,
  type = "button",
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} type={type} {...props} />;
}
