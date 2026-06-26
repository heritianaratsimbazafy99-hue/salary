import { summarizeAnalytics, type PayrollAnalyticsRow } from "@/lib/analytics/queries";

export function PayrollAnalytics({ rows }: { rows: PayrollAnalyticsRow[] }) {
  const summary = summarizeAnalytics(rows);

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">Acces reserve RH centrale et super admin.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Brut total" value={summary.grossTotal} />
        <Metric label="Net total" value={summary.netTotal} />
        <Metric label="Lignes salaries" value={summary.employeeRows} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
