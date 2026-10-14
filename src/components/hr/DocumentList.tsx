import { Download, FileImage, FileText } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { formatDay } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { HrDocument } from "@/lib/hr/documents";

export const DOCUMENT_CATEGORY_LABEL: Record<HrDocument["category"], string> = {
  CONTRACT: "Contrat",
  ADMINISTRATIVE: "Pièce administrative",
  HISTORICAL_PAYSLIP: "Bulletin antérieur",
};

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Private documents; download goes through the authorizing route, never a stored URL. */
export function DocumentList({ documents, renderActions }: { documents: HrDocument[]; renderActions?: (document: HrDocument) => React.ReactNode }) {
  return <ul className="grid gap-3">{documents.map((document) => {
    const Icon = document.mime_type === "application/pdf" ? FileText : FileImage;
    const withdrawn = document.status === "WITHDRAWN";
    return <li key={document.id} className={`grid gap-3 rounded-2xl border p-4 ${withdrawn ? "border-dashed border-border bg-muted/40" : "border-border bg-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 [overflow-wrap:anywhere]"><p className="font-semibold">{document.title}</p>
            <p className="text-sm text-muted-foreground">{DOCUMENT_CATEGORY_LABEL[document.category]}{document.period ? ` · ${document.period}` : ""} · {formatDay(document.document_date)} · {size(document.size_bytes)}</p></div></div>
        {withdrawn ? <StatusBadge status="INACTIVE" label="Retiré" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* A plain link: the route authorizes, then redirects to a 60-second signed URL. */}
        <a className={buttonClasses({ variant: "secondary", size: "sm" })} href={`/api/hr/documents/${document.id}/download`} aria-label={`Télécharger ${document.title}`}><Download className="size-4" aria-hidden="true" />Télécharger</a>
        {renderActions?.(document)}
      </div>
    </li>;
  })}</ul>;
}
