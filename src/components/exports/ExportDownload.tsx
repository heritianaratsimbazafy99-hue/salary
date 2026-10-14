"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ExportType } from "@/lib/payroll/export";

const FORMAT_ICON = { csv: Sheet, xlsx: FileSpreadsheet, pdf: FileText } as const;
const FORMAT_TONE = { csv: "text-teal", xlsx: "text-success", pdf: "text-danger" } as const;

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
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => {
          const Icon = FORMAT_ICON[format];
          return <Button key={format} variant="secondary" disabled={pending !== null} onClick={() => void download(format)}>{pending === format ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Icon className={`size-4 ${FORMAT_TONE[format]}`} aria-hidden="true" />}{pending === format ? "Préparation…" : `Télécharger ${format.toUpperCase()}`}</Button>;
        })}
      </div>
      {error ? <p role="alert" className="rounded-xl bg-danger/[0.06] px-3 py-2 text-sm text-danger">{error}</p> : null}
      <p role="status" className="text-sm text-success empty:hidden">{success}</p>
    </div>
  );
}
