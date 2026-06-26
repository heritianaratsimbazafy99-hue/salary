import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

import { PayslipView } from "@/components/payslips/PayslipView";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadCurrentEmployeePayslip } from "@/lib/payslips/employee";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeePayslipsPage() {
  const supabase = await createClient();
  let payslip: Awaited<ReturnType<typeof loadCurrentEmployeePayslip>>;

  try {
    payslip = await loadCurrentEmployeePayslip(supabase);
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
        />
        {payslip ? <PayslipView {...payslip} /> : <EmptyPayslipState />}
      </div>
    </AppShell>
  );
}

function EmptyPayslipState() {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FileText className="size-6" aria-hidden="true" />
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
