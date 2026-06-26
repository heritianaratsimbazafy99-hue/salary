import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary-strong hover:shadow-[var(--shadow-md)] active:translate-y-px",
  accent:
    "bg-accent text-accent-foreground shadow-[var(--shadow-sm)] hover:brightness-95 hover:shadow-[var(--shadow-md)] active:translate-y-px",
  secondary:
    "border border-border bg-surface text-foreground shadow-[var(--shadow-xs)] hover:bg-muted hover:border-primary/30 active:translate-y-px",
  ghost: "text-foreground hover:bg-muted active:translate-y-px",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-10 px-4 text-sm",
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      type={type}
      {...props}
    />
  );
}
