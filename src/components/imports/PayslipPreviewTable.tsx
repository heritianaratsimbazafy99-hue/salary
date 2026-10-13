"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ManualCorrectionForm } from "./ManualCorrectionForm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

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
    return <p className="text-sm text-muted-foreground">Aucune fiche valide a previsualiser.</p>;
  }

  return (
    <div className="grid gap-4"><p className="text-sm text-muted-foreground">Lignes {page * pageSize + 1} à {Math.min((page + 1) * pageSize, rows.length)} sur {rows.length}</p><Table aria-label="Apercu des fiches de paie importees">
      <TableHeader>
        <TableRow>
          <TableHead>Salarie</TableHead>
          <TableHead>Brut</TableHead>
          <TableHead>Retenues</TableHead>
          <TableHead>Net</TableHead>
          <TableHead>Statut</TableHead>
          {importId ? <TableHead>Correction</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => (
          <TableRow key={row.id}>
            <TableCell className="max-w-64 whitespace-normal break-words">
              <span className="font-medium">{row.employeeName}</span>
              <span className="block break-all text-xs text-muted-foreground">{row.employeeId}</span>
            </TableCell>
            <TableCell>{formatMga(row.grossAmount)}</TableCell>
            <TableCell>{formatMga(row.deductionsTotal)}</TableCell>
            <TableCell>{formatMga(row.netAmount)}</TableCell>
            <TableCell>{row.hasManualAdjustments ? "Modifié" : "Import"}</TableCell>
            {importId ? <TableCell><ManualCorrectionForm row={row} importId={importId} /></TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>{rows.length > pageSize ? <nav aria-label="Pages des fiches" className="flex items-center gap-3"><Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button><span>{page + 1} / {Math.ceil(rows.length / pageSize)}</span><Button type="button" variant="secondary" disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage(page + 1)}>Suivant</Button></nav> : null}</div>
  );
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", {
    style: "currency",
    currency: "MGA",
    maximumFractionDigits: 0,
  }).format(value);
}
