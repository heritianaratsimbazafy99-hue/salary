import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  hint?: string;
};

export function Input({ className, hint, id, label, name, ...props }: InputProps) {
  const inputId = id ?? name;

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-foreground" htmlFor={inputId}>
        {label}
      </label>
      <input
        className={[
          "h-11 rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground shadow-[var(--shadow-xs)]",
          "outline-none transition placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-2 focus:ring-primary/25",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        id={inputId}
        name={name}
        {...props}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
