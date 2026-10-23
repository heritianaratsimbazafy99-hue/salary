import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronRight, Download, FileText, History, TrendingUp, Wallet } from "lucide-react";

import { PayslipView } from "@/components/payslips/PayslipView";
import { PrintPayslipButton } from "@/components/payslips/PrintPayslipButton";
import { DownloadPayslipPdfButton } from "@/components/payslips/DownloadPayslipPdfButton";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { ColumnChart } from "@/components/ui/Charts";
import { formatCompact, formatMga, formatMonthLong, formatMonthShort } from "@/components/ui/format";
import { EmptyState, Panel } from "@/components/ui/Surface";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadEmployeePayslips, type EmployeePayslip } from "@/lib/payslips/employee";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage({
  searchParams,
}: {
  searchParams?: Promise<{ payslip?: string | string[] }>;
}) {
  const supabase = await createClient();
  let payslips: Awaited<ReturnType<typeof loadEmployeePayslips>>;

  try {
    payslips = await loadEmployeePayslips(supabase);
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return <ForbiddenEmployeeAccess />;
    }

    throw error;
  }

  const requestedId = (await searchParams)?.payslip;
  const selectedPayslip = requestedId === undefined
    ? payslips[0]
    : payslips.find((payslip) => payslip.id === requestedId);

  // Select only within this employee's RLS-filtered published documents.
  if (requestedId !== undefined && !selectedPayslip) notFound();

  const latest = payslips[0];
  const selectedIndex = selectedPayslip ? payslips.indexOf(selectedPayslip) : -1;
  const previous = selectedIndex >= 0 ? payslips[selectedIndex + 1] : undefined;
  const firstName = latest?.employeeName.trim().split(/\s+/)[0];
  const averageNet = payslips.length
    ? Math.round(payslips.reduce((sum, payslip) => sum + payslip.netAmount, 0) / payslips.length)
    : 0;

  return (
    <AppShell role="employee">
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className={styles.controls}>
          <PageHeader
            eyebrow="Espace salarié"
            title="Mes fiches de paie"
            icon={Wallet}
            description={
              firstName
                ? `Bonjour ${firstName} — consultez et téléchargez vos fiches internes publiées.`
                : "Consultez et téléchargez vos fiches internes publiées."
            }
            actions={payslips.length > 0 ? <DownloadPayslipsLink /> : null}
          >
            {latest ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <HeaderStat className="col-span-2 sm:col-span-1" icon={Wallet} label="Dernier net" value={formatMga(latest.netAmount)} />
                <HeaderStat icon={FileText} label="Fiches disponibles" value={payslips.length} />
                <HeaderStat icon={TrendingUp} label="Net moyen" value={formatMga(averageNet)} />
              </div>
            ) : null}
          </PageHeader>
        </div>
        {selectedPayslip ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid min-w-0 gap-4">
              <div
                className={`${styles.controls} flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/80 px-4 py-3 shadow-[var(--shadow-xs)] backdrop-blur`}
              >
                <p className="flex items-center gap-2 text-sm font-semibold capitalize text-foreground">
                  <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                  {formatMonthLong(selectedPayslip.periodStart)}
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <DownloadPayslipPdfButton key={selectedPayslip.id} payslipId={selectedPayslip.id} />
                  <PrintPayslipButton />
                </div>
              </div>
              <PayslipView
                {...selectedPayslip}
                comparison={
                  previous && previous.netAmount > 0
                    ? {
                        previousLabel: formatMonthShort(previous.periodStart),
                        delta: (selectedPayslip.netAmount - previous.netAmount) / previous.netAmount,
                      }
                    : undefined
                }
              />
            </div>
            <div className={`${styles.controls} grid min-w-0 gap-6 lg:sticky lg:top-8`}>
              {payslips.length > 1 ? <NetTrend payslips={payslips} selectedId={selectedPayslip.id} /> : null}
              <PayslipHistory payslips={payslips} selectedId={selectedPayslip.id} />
            </div>
          </div>
        ) : (
          <EmptyPayslipState />
        )}
      </div>
    </AppShell>
  );
}

function DownloadPayslipsLink() {
  return (
    <a className={buttonClasses({ variant: "secondary" })} href="/api/employee/payslips/export">
      <Download className="size-4" aria-hidden="true" />
      Télécharger CSV
    </a>
  );
}

function NetTrend({ payslips, selectedId }: { payslips: EmployeePayslip[]; selectedId: string }) {
  const series = [...payslips].slice(0, 12).reverse();
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <Panel
      icon={TrendingUp}
      tone="teal"
      title="Évolution du net"
      description="Touchez une barre pour ouvrir la fiche."
    >
      <ColumnChart
        label={`Net à payer sur ${series.length} périodes, de ${formatMga(first?.netAmount ?? 0)} à ${formatMga(last?.netAmount ?? 0)}.`}
        tone="primary"
        data={series.map((payslip) => ({
          key: payslip.id,
          label: formatMonthShort(payslip.periodStart),
          value: payslip.netAmount,
          valueLabel: formatCompact(payslip.netAmount),
          highlight: payslip.id === selectedId,
          href: `/employee/payslips?payslip=${payslip.id}`,
        }))}
      />
    </Panel>
  );
}

function PayslipHistory({ payslips, selectedId }: { payslips: EmployeePayslip[]; selectedId: string }) {
  const maxNet = Math.max(1, ...payslips.map((payslip) => payslip.netAmount));

  return (
    <Panel icon={History} title="Historique publié" description={`${payslips.length} fiche(s) disponible(s) pendant un an.`}>
      <ul className="stagger grid grid-cols-1 gap-2">
        {payslips.map((payslip) => {
          const isSelected = payslip.id === selectedId;
          return (
            <li key={payslip.id}>
              <Link
                aria-current={isSelected ? "page" : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? "border-primary/30 bg-primary/[0.06] shadow-[var(--shadow-xs)]"
                    : "border-transparent hover:border-border hover:bg-surface-elevated"
                }`}
                href={`/employee/payslips?payslip=${payslip.id}`}
                scroll={false}
              >
                <MonthTile isoDate={payslip.periodStart} active={isSelected} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{payslip.periodLabel}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Publiée le {formatDate(payslip.publishedAt)}{isSelected ? " · Fiche affichée" : " · Consulter"}
                  </span>
                  <span aria-hidden="true" className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={`chart-bar block h-full rounded-full ${isSelected ? "bg-accent" : "bg-primary/35"}`}
                      style={{ width: `${(payslip.netAmount / maxNet) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-display text-sm font-semibold tabular-nums">
                  {formatMga(payslip.netAmount)}
                  <ChevronRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MonthTile({ isoDate, active }: { isoDate: string; active: boolean }) {
  const [year, month] = isoDate.split("-");
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)))
    .replace(".", "");
  return (
    <span
      aria-hidden="true"
      className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none ${
        active ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]" : "bg-muted text-foreground"
      }`}
    >
      <span className="text-[0.62rem] font-bold uppercase tracking-wide">{monthName}</span>
      <span className={`mt-1 text-[0.62rem] ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{year}</span>
    </span>
  );
}

function EmptyPayslipState() {
  return (
    <EmptyState
      icon={FileText}
      title="Aucune fiche publiée"
      description={
        <>
          Aucune fiche de paie publiee n&apos;est disponible pour votre compte. Vous serez notifié
          dès qu&apos;une nouvelle fiche sera prête.
        </>
      }
    />
  );
}

function ForbiddenEmployeeAccess() {
  return <AccessDenied context="Espace salarié" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-MG", {
    dateStyle: "medium",
  }).format(new Date(value));
}
