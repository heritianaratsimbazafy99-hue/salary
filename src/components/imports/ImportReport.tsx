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
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Lignes valides" value={validRowCount} tone="success" />
        <Metric label="Lignes en erreur" value={invalidRowCount} tone={invalidRowCount > 0 ? "danger" : undefined} />
        <Metric label="Salaries inconnus" value={unknownEmployeeCount} tone={unknownEmployeeCount > 0 ? "warning" : undefined} />
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
        <p className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Aucune erreur detectee.
        </p>
      )}
    </section>
  );
}

const TONE_CLASSES = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
} as const;

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-xs)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-bold tabular-nums ${tone ? TONE_CLASSES[tone] : "text-foreground"}`}
      >
        {value.toLocaleString("fr-MG")}
      </p>
    </div>
  );
}
