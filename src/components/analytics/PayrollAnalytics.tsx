import type { LucideIcon } from "lucide-react";
import { Coins, Users, Wallet } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { summarizeAnalytics, type PayrollAnalyticsRow } from "@/lib/analytics/queries";

type Tone = "teal" | "primary" | "amber";

export function PayrollAnalytics({ rows }: { rows: PayrollAnalyticsRow[] }) {
  const summary = summarizeAnalytics(rows);

  return (
    <section className="space-y-5">
      <p className="text-sm text-muted-foreground">Accès réservé RH centrale et super admin.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Brut total" value={formatMga(summary.grossTotal)} icon={Coins} tone="teal" />
        <Metric label="Net total" value={formatMga(summary.netTotal)} icon={Wallet} tone="primary" />
        <Metric
          label="Lignes salariés"
          value={summary.employeeRows.toLocaleString("fr-MG")}
          icon={Users}
          tone="amber"
        />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune ligne analytique disponible.
        </p>
      ) : (
        <Table aria-label="Lignes analytics paie">
          <TableHeader>
            <TableRow>
              <TableHead>Agence</TableHead>
              <TableHead>Salarie</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Brut</TableHead>
              <TableHead>Retenues</TableHead>
              <TableHead>Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.employeeId}-${row.periodStart}-${row.periodEnd}`}>
                <TableCell>{row.agencyName}</TableCell>
                <TableCell className="max-w-64 whitespace-normal break-words">
                  <span className="font-medium">{row.employeeName}</span>
                  <span className="block break-all text-xs text-muted-foreground">{row.employeeId}</span>
                </TableCell>
                <TableCell>
                  {row.periodStart} - {row.periodEnd}
                </TableCell>
                <TableCell>{formatMga(row.grossAmount)}</TableCell>
                <TableCell>{formatMga(row.deductionsTotal)}</TableCell>
                <TableCell>{formatMga(row.netAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

const toneTile: Record<Tone, string> = {
  teal: "bg-teal/12 text-teal",
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber/15 text-amber-foreground",
};

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-xs)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <span className={`flex size-10 items-center justify-center rounded-xl ${toneTile[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold tabular-nums ${
          tone === "primary" ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", {
    style: "currency",
    currency: "MGA",
    maximumFractionDigits: 0,
  }).format(value);
}
