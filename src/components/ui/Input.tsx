import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  hint?: string;
};

/** Shared field chrome for inputs and selects. */
export const fieldClass = [
  "h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3.5 text-base text-foreground shadow-[var(--shadow-xs)] sm:text-sm",
  "outline-none transition placeholder:text-muted-foreground",
  "hover:border-primary/30 focus:border-primary focus:ring-4 focus:ring-primary/15",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
].join(" ");

export const labelClass = "text-sm font-medium text-foreground";

export function Input({ className, hint, id, label, name, ...props }: InputProps) {
  const inputId = id ?? name;

  return (
    <div className="grid min-w-0 gap-2">
      <label className={labelClass} htmlFor={inputId}>
        {label}
      </label>
      <input
        className={[fieldClass, className].filter(Boolean).join(" ")}
        id={inputId}
        name={name}
        {...props}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Native checkbox rendered as a toggle switch (keeps checkbox semantics). */
export const switchClass = [
  "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground/30 transition-colors duration-200",
  "before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-white before:shadow-[var(--shadow-sm)] before:transition-transform before:duration-200 before:content-['']",
  "checked:bg-success checked:before:translate-x-5",
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
