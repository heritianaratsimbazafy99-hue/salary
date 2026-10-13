"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ExportType } from "@/lib/payroll/export";

type Props = {
  agencyId?: string;
  importId?: string;
  exportType?: ExportType;
  periodStart?: string;
  periodEnd?: string;
  allowPdf?: boolean;
};

export function ExportDownload({ agencyId, importId, exportType = "IMPORT_REPORT", periodStart, periodEnd, allowPdf = false }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function download(format: "csv" | "xlsx" | "pdf") {
    setPending(format);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyId, importId, exportType, periodStart, periodEnd, format }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Impossible de télécharger l’export.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `export.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(`Export ${format.toUpperCase()} téléchargé.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible de télécharger l’export.");
    } finally {
      setPending(null);
    }
  }
  const formats = allowPdf && exportType === "PUBLISHED_PAYSLIPS" ? (["csv", "xlsx", "pdf"] as const) : (["csv", "xlsx"] as const);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => <Button key={format} variant="secondary" disabled={pending !== null} onClick={() => void download(format)}><Download size={16} aria-hidden="true" />{pending === format ? "Préparation…" : `Télécharger ${format.toUpperCase()}`}</Button>)}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <p role="status" className="text-sm text-muted-foreground">{success}</p>
    </div>
  );
}
