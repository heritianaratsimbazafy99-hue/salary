"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";

export function DownloadPayslipPdfButton({ payslipId }: { payslipId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/employee/payslips/${encodeURIComponent(payslipId)}/pdf`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Impossible de télécharger la fiche PDF.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "fiche-paie.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible de télécharger la fiche PDF.");
    } finally {
      setPending(false);
    }
  }

  return <div className="grid gap-2">
    <a href={`/api/employee/payslips/${encodeURIComponent(payslipId)}/pdf`} className={buttonClasses({ variant: "primary" })} aria-disabled={pending} onClick={(event) => { event.preventDefault(); if (!pending) void download(); }}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Download aria-hidden="true" className="size-4" />}{pending ? "Préparation…" : "Télécharger PDF"}
    </a>
    {error ? <p role="alert" className="max-w-sm rounded-xl bg-danger/[0.06] px-3 py-2 text-sm text-danger">{error}</p> : null}
  </div>;
}
