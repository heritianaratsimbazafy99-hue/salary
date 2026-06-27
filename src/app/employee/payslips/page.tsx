import { redirect } from "next/navigation";
import { Download, FileText, History } from "lucide-react";

import { PayslipView } from "@/components/payslips/PayslipView";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadEmployeePayslips, type EmployeePayslip } from "@/lib/payslips/employee";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage() {
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

  return (
    <AppShell role="employee">
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          eyebrow="Espace salarié"
          title="Mes fiches de paie"
          description="Consultez et téléchargez vos fiches internes publiées."
          actions={payslips.length > 0 ? <DownloadPayslipsLink /> : null}
        />
        {payslips[0] ? (
          <>
            <PayslipView {...payslips[0]} />
            <PayslipHistory payslips={payslips} />
          </>
        ) : (
          <EmptyPayslipState />
        )}
      </div>
    </AppShell>
  );
}

function DownloadPayslipsLink() {
  return (
    <a
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-[var(--shadow-xs)] transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:bg-muted hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      href="/api/employee/payslips/export"
    >
      <Download className="size-4" aria-hidden="true" />
      Télécharger CSV
    </a>
  );
}

function PayslipHistory({ payslips }: { payslips: EmployeePayslip[] }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <History className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-lg font-semibold">Historique publié</h2>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {payslips.map((payslip) => (
          <li
            className="group flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-primary/[0.04]"
            key={payslip.id}
          >
            <span>
              <span className="block text-sm font-medium">{payslip.periodLabel}</span>
              <span className="block text-xs text-muted-foreground">
                Publiée le {formatDate(payslip.publishedAt)}
              </span>
            </span>
            <span className="font-display text-sm font-semibold tabular-nums">
              {formatMga(payslip.netAmount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyPayslipState() {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileText className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 font-display text-lg font-semibold">Aucune fiche publiée</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Aucune fiche de paie publiee n&apos;est disponible pour votre compte. Vous serez notifié
        dès qu&apos;une nouvelle fiche sera prête.
      </p>
    </section>
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

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", {
    style: "currency",
    currency: "MGA",
    maximumFractionDigits: 0,
  }).format(value);
}
