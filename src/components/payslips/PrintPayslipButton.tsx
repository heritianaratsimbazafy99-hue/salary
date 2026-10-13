"use client";

import { Printer } from "lucide-react";

export function PrintPayslipButton() {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => window.print()}
      type="button"
    >
      <Printer aria-hidden="true" className="size-4" />
      Imprimer
    </button>
  );
}
