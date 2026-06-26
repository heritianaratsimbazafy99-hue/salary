import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

type ImportError = {
  rowNumber: number;
  fieldName: string;
  message: string;
};

type Props = {
  validRowCount: number;
  invalidRowCount: number;
  unknownEmployeeCount: number;
  errors: ImportError[];
};

export function ImportReport({ validRowCount, invalidRowCount, unknownEmployeeCount, errors }: Props) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Lignes valides" value={validRowCount} />
        <Metric label="Lignes en erreur" value={invalidRowCount} />
        <Metric label="Salaries inconnus" value={unknownEmployeeCount} />
      </div>
      {errors.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ligne</TableHead>
              <TableHead>Champ</TableHead>
              <TableHead>Erreur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((error, index) => (
              <TableRow key={`${error.rowNumber}:${error.fieldName}:${error.message}:${index}`}>
                <TableCell>{error.rowNumber}</TableCell>
                <TableCell>{error.fieldName}</TableCell>
                <TableCell>
                  <span className="block max-w-md whitespace-normal break-words">{error.message}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune erreur detectee.</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
