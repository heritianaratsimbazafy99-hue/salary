import type { ComponentPropsWithoutRef } from "react";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table
        className={joinClasses("min-w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader(props: ComponentPropsWithoutRef<"thead">) {
  return <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground" {...props} />;
}

export function TableBody(props: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return <tr className={joinClasses("align-middle", className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={joinClasses("whitespace-nowrap px-4 py-3 font-semibold", className)}
      scope="col"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  return <td className={joinClasses("whitespace-nowrap px-4 py-3", className)} {...props} />;
}
