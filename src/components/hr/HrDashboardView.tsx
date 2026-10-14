import Link from "next/link";
import { AlarmClock, ArrowRightLeft, CalendarDays, CalendarX2, Download, FileExclamationPoint, MessageSquareText, ShieldCheck, Target, UserMinus, UserPlus, Users } from "lucide-react";
import { BarList, ProgressRing } from "@/components/ui/Charts";
import { buttonClasses } from "@/components/ui/Button";
import { formatDay, formatMonthLong } from "@/components/ui/format";
import { Callout, EmptyState, Panel, StatCard } from "@/components/ui/Surface";
import { CONTRACT_TYPE_LABEL } from "@/lib/hr/labels";
import { absenteeismRate, coverageRate, type Dashboard } from "@/lib/hr/reporting";

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 1000) / 10} %`);

/**
 * KPI view shared by HR, team managers and client viewers. Every figure comes
 * from the database already filtered by role and scope; absence figures are
 * absent (null) for client viewers and therefore not rendered.
 */
export function HrDashboardView({ dashboard, exportQuery, exports }: { dashboard: Dashboard; exportQuery: string; exports: Array<{ kind: string; label: string }> }) {
  const t = dashboard.totals;
  const coverage = coverageRate(t.headcount, t.assigned);
  const absenteeism = absenteeismRate(t.absence_days, t.headcount, dashboard.period.business_days);
  const urgent = dashboard.expiring.filter((c) => c.days_left <= 7);
  return <div className="grid min-w-0 gap-6">
    {urgent.length ? <Callout icon={AlarmClock} tone="amber">{urgent.length} contrat(s) arrivent à échéance dans 7 jours ou moins : {urgent.slice(0, 5).map((c) => `${c.full_name} (${formatDay(c.contract_end)})`).join(", ")}{urgent.length > 5 ? "…" : ""}</Callout> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Users} label="Effectif actif" value={t.headcount} hint={`au ${formatDay(dashboard.period.today)}`} />
      <StatCard icon={Target} tone="teal" label="Couverture" value={pct(coverage)} hint="Actifs sous contrat avec une affectation active" />
      {absenteeism !== null ? <StatCard icon={CalendarDays} tone="amber" label="Absentéisme" value={pct(absenteeism)} hint={`${t.absence_days} j d’absence approuvés en ${formatMonthLong(dashboard.period.start)}`} />
        : <StatCard icon={ArrowRightLeft} tone="amber" label="Remplacements confirmés" value={t.confirmed_replacements} hint={`${formatMonthLong(dashboard.period.start)}`} />}
      <StatCard icon={ArrowRightLeft} tone={t.open_replacements ? "danger" : "success"} emphasis={t.open_replacements > 0} label="Remplacements à pourvoir" value={t.open_replacements}
        hint={t.avg_replacement_hours !== null ? `Délai moyen de confirmation : ${t.avg_replacement_hours} h` : undefined} />
      <StatCard icon={UserPlus} tone="success" label="Entrées du mois" value={t.entries} />
      <StatCard icon={UserMinus} tone="neutral" label="Sorties du mois" value={t.exits} />
      <StatCard icon={CalendarX2} tone={t.contracts_ending_30 ? "amber" : "neutral"} label="Contrats < 30 j" value={t.contracts_ending_30} hint={`${t.contracts_ending_60} sous 60 j · ${t.contracts_ending_90} sous 90 j`} />
      {t.pending_leaves !== null ? <StatCard icon={CalendarDays} label="Congés en attente" value={t.pending_leaves} /> : null}
      {dashboard.hr ? <>
        <StatCard icon={MessageSquareText} tone={dashboard.hr.open_requests ? "amber" : "neutral"} label="Demandes RH ouvertes" value={dashboard.hr.open_requests}
          hint={`${dashboard.hr.in_progress_requests} en cours${dashboard.hr.avg_resolution_hours !== null ? ` · résolution moyenne ${dashboard.hr.avg_resolution_hours} h` : ""}`} />
        <StatCard icon={ShieldCheck} tone={dashboard.hr.cnaps_to_declare + dashboard.hr.cnaps_to_regularize ? "amber" : "success"} label="CNAPS à traiter" value={dashboard.hr.cnaps_to_declare + dashboard.hr.cnaps_to_regularize}
          hint={`${dashboard.hr.cnaps_to_declare} à déclarer · ${dashboard.hr.cnaps_to_regularize} à régulariser`} />
        <StatCard icon={FileExclamationPoint} tone={dashboard.hr.missing_files ? "amber" : "success"} label="Dossiers à compléter" value={dashboard.hr.missing_files} />
      </> : null}
    </div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel icon={Target} tone="teal" title="Couverture par site" titleId="coverage" description="Part des collaborateurs actifs sous contrat qui ont une affectation active. Elle ne mesure pas des postes contractuellement requis.">
        {dashboard.sites.length ? <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <ProgressRing value={coverage} tone="teal" label={`Couverture globale ${pct(coverage)}`}><span className="font-display text-xl font-bold">{pct(coverage)}</span><span className="text-xs text-muted-foreground">globale</span></ProgressRing>
          <BarList label="Couverture par site" max={1} items={dashboard.sites.map((s) => ({ label: s.site_name, value: coverageRate(s.headcount, s.assigned), valueLabel: `${s.assigned}/${s.headcount}`, tone: "teal" as const,
            hint: s.open_replacements ? `${s.open_replacements} à pourvoir` : undefined }))} />
        </div> : <EmptyState icon={Target} headingLevel={3} title="Aucun site dans votre périmètre." />}
      </Panel>
      <Panel icon={CalendarX2} tone="amber" title="Échéances de contrat (90 jours)" titleId="expiring" description="Alertes à J-30, J-15 et J-7.">
        {dashboard.expiring.length ? <ul className="grid max-h-96 gap-2 overflow-auto pr-1">{dashboard.expiring.map((c) => <li key={c.employee_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{c.full_name}</span> <span className="font-mono text-xs text-muted-foreground">{c.matricule}</span><span className="block text-xs text-muted-foreground">{c.site_name} · {CONTRACT_TYPE_LABEL[c.contract_type]} · fin le {formatDay(c.contract_end)}</span></span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.days_left <= 7 ? "bg-danger/10 text-danger" : c.days_left <= 30 ? "bg-amber/15 text-amber-foreground" : "bg-muted text-muted-foreground"}`}>J-{c.days_left}</span>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun contrat n’arrive à échéance dans les 90 prochains jours.</p>}
      </Panel>
    </div>
    <Panel icon={Download} tone="primary" title="Exports" titleId="exports" description={`Fichiers CSV du ${formatDay(dashboard.period.start)} au ${formatDay(dashboard.period.end)}, limités à votre périmètre.`}>
      <div className="flex flex-wrap gap-2">{exports.map((e) => <Link key={e.kind} prefetch={false} className={buttonClasses({ variant: "secondary", size: "sm" })} href={`/api/hr/reports/${e.kind}?${exportQuery}`}><Download className="size-4" aria-hidden="true" />{e.label}</Link>)}</div>
    </Panel>
  </div>;
}
