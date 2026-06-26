import { redirect } from "next/navigation";

import { PayslipView } from "@/components/payslips/PayslipView";
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
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Mes fiches de paie</h1>
        <p className="text-sm text-muted-foreground">Consultez vos fiches internes publiees.</p>
      </div>
      {payslip ? <PayslipView {...payslip} /> : <EmptyPayslipState />}
    </main>
  );
}

function EmptyPayslipState() {
  return (
    <section className="rounded border border-border p-6">
      <h2 className="text-xl font-semibold">Aucune fiche publiee</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Aucune fiche de paie publiee n&apos;est disponible pour votre compte.
      </p>
    </section>
  );
}

function ForbiddenEmployeeAccess() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-10">
      <p className="text-sm font-medium text-muted-foreground">Espace salarie</p>
      <h1 className="mt-3 text-2xl font-semibold">Acces refuse</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Votre role ne permet pas d&apos;ouvrir cette page.
      </p>
    </main>
  );
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
