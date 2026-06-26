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
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2">Ligne</th>
              <th>Champ</th>
              <th>Erreur</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr className="border-b border-border" key={`${error.rowNumber}:${error.fieldName}`}>
                <td className="py-2">{error.rowNumber}</td>
                <td>{error.fieldName}</td>
                <td>{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
