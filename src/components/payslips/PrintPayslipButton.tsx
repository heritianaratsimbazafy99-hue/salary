"use client";

import { Printer } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";

export function PrintPayslipButton() {
  return (
    <button
      className={buttonClasses({ variant: "secondary" })}
      onClick={() => window.print()}
      type="button"
    >
      <Printer aria-hidden="true" className="size-4" />
      Imprimer
    </button>
  );
}
