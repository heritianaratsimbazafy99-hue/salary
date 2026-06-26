import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

type PreviewRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  hasManualAdjustments: boolean;
};

export function PayslipPreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune fiche valide a previsualiser.</p>;
  }

  return (
    <Table aria-label="Apercu des fiches de paie importees">
      <TableHeader>
        <TableRow>
          <TableHead>Salarie</TableHead>
          <TableHead>Brut</TableHead>
          <TableHead>Retenues</TableHead>
          <TableHead>Net</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="max-w-64 whitespace-normal break-words">
              <span className="font-medium">{row.employeeName}</span>
              <span className="block break-all text-xs text-muted-foreground">{row.employeeId}</span>
            </TableCell>
            <TableCell>{formatMga(row.grossAmount)}</TableCell>
            <TableCell>{formatMga(row.deductionsTotal)}</TableCell>
            <TableCell>{formatMga(row.netAmount)}</TableCell>
            <TableCell>{row.hasManualAdjustments ? "Modifie" : "Import"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", {
    style: "currency",
    currency: "MGA",
    maximumFractionDigits: 0,
  }).format(value);
}
