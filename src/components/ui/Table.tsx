import type { ComponentPropsWithoutRef } from "react";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Table({
  className,
  containerClassName,
  ...props
}: ComponentPropsWithoutRef<"table"> & { containerClassName?: string }) {
  return (
    <div
      className={joinClasses(
        "w-full overflow-auto overscroll-x-contain rounded-3xl border border-border/80 bg-surface shadow-[var(--shadow-sm)]",
        containerClassName,
      )}
    >
      <table
        className={joinClasses("min-w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader(props: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead
      className="sticky top-0 z-10 border-b border-border bg-surface-elevated/95 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur"
      {...props}
    />
  );
}

export function TableBody(props: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      className={joinClasses("align-middle transition-colors hover:bg-primary/[0.04]", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={joinClasses("whitespace-nowrap px-4 py-3.5 font-bold", className)}
      scope="col"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  return <td className={joinClasses("whitespace-nowrap px-4 py-3.5", className)} {...props} />;
}
