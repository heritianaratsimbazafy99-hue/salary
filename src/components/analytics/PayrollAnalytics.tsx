import { Building2, CalendarRange, Coins, Landmark, PieChart, Table2, TrendingUp, Users, Wallet } from "lucide-react";

import { BarList, ChartLegend, ColumnChart, DonutChart } from "@/components/ui/Charts";
import { formatCompact, formatCount, formatMga, formatMonthShort } from "@/components/ui/format";
import { EmptyState, Panel, StatCard } from "@/components/ui/Surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { summarizeAnalytics, type PayrollAnalyticsRow } from "@/lib/analytics/queries";

export function PayrollAnalytics({ rows }: { rows: PayrollAnalyticsRow[] }) {
  const summary = summarizeAnalytics(rows);
  const deductionsTotal = rows.reduce((sum, row) => sum + row.deductionsTotal, 0);
  const employees = new Set(rows.map((row) => `${row.agencyName}:${row.employeeId}`)).size;

  const byPeriod = new Map<string, number>();
  const byAgency = new Map<string, { net: number; employees: Set<string> }>();
  for (const row of rows) {
    byPeriod.set(row.periodStart, (byPeriod.get(row.periodStart) ?? 0) + row.netAmount);
    const agency = byAgency.get(row.agencyName) ?? { net: 0, employees: new Set<string>() };
    agency.net += row.netAmount;
    agency.employees.add(row.employeeId);
    byAgency.set(row.agencyName, agency);
  }
  const periods = [...byPeriod.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-12);
  const agencies = [...byAgency.entries()].sort(([, left], [, right]) => right.net - left.net);
  const agencyTones = ["primary", "teal", "accent", "amber"] as const;

  return (
    <section className="grid gap-6">
      <p className="text-sm text-muted-foreground">Accès réservé RH centrale et super admin.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Brut total" value={formatMga(summary.grossTotal)} icon={Coins} tone="teal" />
        <StatCard label="Net total" value={formatMga(summary.netTotal)} icon={Wallet} tone="primary" emphasis />
        <StatCard label="Retenues" value={formatMga(deductionsTotal)} icon={Landmark} tone="danger" />
        <StatCard
          label="Lignes salariés"
          value={summary.employeeRows.toLocaleString("fr-MG")}
          icon={Users}
          tone="amber"
          hint={`${formatCount(employees)} salarié(s) distinct(s)`}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={PieChart} title="Aucune donnée" description="Aucune ligne analytique disponible." />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel icon={TrendingUp} tone="primary" title="Net versé par période" description="Somme des nets publiés, toutes agences confondues.">
              <ColumnChart
                height={200}
                label={`Net versé sur ${periods.length} périodes.`}
                data={periods.map(([period, value], index) => ({
                  key: period,
                  label: formatMonthShort(period),
                  value,
                  valueLabel: formatCompact(value),
                  highlight: index === periods.length - 1,
                }))}
              />
            </Panel>
            <Panel icon={PieChart} tone="teal" title="Du brut au net" description="Part des retenues dans la masse brute.">
              <div className="flex flex-col items-center gap-6 sm:flex-row xl:flex-col 2xl:flex-row">
                <DonutChart
                  size={150}
                  thickness={20}
                  label={`Net ${formatMga(summary.netTotal)}, retenues ${formatMga(deductionsTotal)}.`}
                  segments={[
                    { label: "Net", value: summary.netTotal, tone: "primary" },
                    { label: "Retenues", value: deductionsTotal, tone: "amber" },
                  ]}
                >
                  <span className="font-display text-2xl font-bold">
                    {summary.grossTotal ? Math.round((summary.netTotal / summary.grossTotal) * 100) : 0}%
                  </span>
                  <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">net / brut</span>
                </DonutChart>
                <div className="w-full min-w-0 flex-1">
                  <ChartLegend
                    items={[
                      { label: "Net versé", tone: "primary", value: formatCompact(summary.netTotal) },
                      { label: "Retenues", tone: "amber", value: formatCompact(deductionsTotal) },
                    ]}
                  />
                </div>
              </div>
            </Panel>
          </div>
          <Panel icon={Building2} tone="accent" title="Répartition par agence" description="Net publié cumulé et nombre de salariés par agence.">
            <BarList
              label="Net publié par agence"
              items={agencies.map(([name, agency], index) => ({
                label: name,
                value: agency.net,
                valueLabel: formatMga(agency.net),
                hint: `${agency.employees.size} salarié(s)`,
                tone: agencyTones[index % agencyTones.length],
              }))}
            />
          </Panel>
          <Panel icon={Table2} title="Détail des lignes" description={<span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" aria-hidden="true" />{rows.length} ligne(s), de la plus récente à la plus ancienne.</span>}>
            <Table aria-label="Lignes analytics paie" containerClassName="max-h-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Agence</TableHead>
                  <TableHead>Salarie</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Brut</TableHead>
                  <TableHead className="text-right">Retenues</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.agencyName}-${row.employeeId}-${row.periodStart}-${row.periodEnd}`}>
                    <TableCell>{row.agencyName}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal break-words">
                      <span className="font-medium">{row.employeeName}</span>
                      <span className="block break-all text-xs text-muted-foreground">{row.employeeId}</span>
                    </TableCell>
                    <TableCell>
                      {row.periodStart} - {row.periodEnd}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMga(row.grossAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-danger">{formatMga(row.deductionsTotal)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMga(row.netAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}
    </section>
  );
}
