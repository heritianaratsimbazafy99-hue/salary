"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { formatMga } from "@/components/ui/format";
import { Avatar } from "@/components/ui/Surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { ManualCorrectionForm } from "./ManualCorrectionForm";

type PreviewRow = {
  id: string;
  updatedAt?: string;
  notes?: string;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  hasManualAdjustments: boolean;
};

export function PayslipPreviewTable({ rows, importId }: { rows: PreviewRow[]; importId?: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Aucune fiche valide a previsualiser.</p>;
  }

  const totals = rows.reduce(
    (sum, row) => ({
      gross: sum.gross + row.grossAmount,
      deductions: sum.deductions + row.deductionsTotal,
      net: sum.net + row.netAmount,
      adjusted: sum.adjusted + (row.hasManualAdjustments ? 1 : 0),
    }),
    { gross: 0, deductions: 0, net: 0, adjusted: 0 },
  );
  const maxNet = Math.max(1, ...rows.map((row) => row.netAmount));
  const pageCount = Math.ceil(rows.length / pageSize);

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Totaux de l'import">
        <Total label="Masse brute" value={formatMga(totals.gross)} />
        <Total label="Retenues" value={formatMga(totals.deductions)} tone="text-danger" />
        <Total label="Net à verser" value={formatMga(totals.net)} tone="text-primary" />
        <Total label="Lignes modifiées" value={String(totals.adjusted)} tone={totals.adjusted ? "text-amber-foreground" : undefined} />
      </dl>
      <p className="text-sm text-muted-foreground">Lignes {page * pageSize + 1} à {Math.min((page + 1) * pageSize, rows.length)} sur {rows.length}</p>
      <Table aria-label="Apercu des fiches de paie importees">
        <TableHeader>
          <TableRow>
            <TableHead>Salarie</TableHead>
            <TableHead className="text-right">Brut</TableHead>
            <TableHead className="text-right">Retenues</TableHead>
            <TableHead>Net</TableHead>
            <TableHead>Statut</TableHead>
            {importId ? <TableHead>Correction</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-64 whitespace-normal break-words">
                <span className="flex items-center gap-3">
                  <Avatar name={row.employeeName} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{row.employeeName}</span>
                    <span className="block break-all text-xs text-muted-foreground">{row.employeeId}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMga(row.grossAmount)}</TableCell>
              <TableCell className="text-right tabular-nums text-danger">{formatMga(row.deductionsTotal)}</TableCell>
              <TableCell>
                <span className="block font-semibold tabular-nums">{formatMga(row.netAmount)}</span>
                <span aria-hidden="true" className="mt-1.5 block h-1 w-24 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-gradient-to-r from-primary to-teal" style={{ width: `${Math.max(0, (row.netAmount / maxNet) * 100)}%` }} />
                </span>
              </TableCell>
              <TableCell>
                {row.hasManualAdjustments ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1 text-xs font-bold text-amber-foreground">
                    <PencilLine className="size-3" aria-hidden="true" />
                    Modifié
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Import</span>
                )}
              </TableCell>
              {importId ? <TableCell className="align-top"><ManualCorrectionForm row={row} importId={importId} /></TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > pageSize ? (
        <nav aria-label="Pages des fiches" className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Précédent
          </Button>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">{page + 1} / {pageCount}</span>
          <Button type="button" variant="secondary" disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage(page + 1)}>
            Suivant
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface-elevated px-3.5 py-3">
      <dt className="truncate text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 truncate font-display text-base font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}
