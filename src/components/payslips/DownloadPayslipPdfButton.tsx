"use client";

import { useState } from "react";
import { Download } from "lucide-react";

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
    <a href={`/api/employee/payslips/${encodeURIComponent(payslipId)}/pdf`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60" aria-disabled={pending} onClick={(event) => { event.preventDefault(); if (!pending) void download(); }}>
      <Download aria-hidden="true" className="size-4" />{pending ? "Préparation…" : "Télécharger PDF"}
    </a>
    {error ? <p role="alert" className="max-w-sm text-sm text-danger">{error}</p> : null}
  </div>;
}
