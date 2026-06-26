import { redirect } from "next/navigation";

import { PayrollAnalytics } from "@/components/analytics/PayrollAnalytics";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadPayrollAnalyticsRows } from "@/lib/analytics/queries";
import { recordAuditEvent } from "@/lib/audit/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  let actor: Awaited<ReturnType<typeof requireCanReadPayrollAnalytics>>;

  try {
    actor = await requireCanReadPayrollAnalytics();
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return <ForbiddenAnalyticsAccess />;
    }

    throw error;
  }

  const supabase = await createClient();
  const rows = await loadPayrollAnalyticsRows(supabase);

  await recordAuditEvent({
    action: "ANALYTICS_VIEWED",
    actorProfileId: actor.id,
    actorRole: actor.role,
    resourceType: "payroll_analytics",
  });

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics paie</h1>
        <p className="text-sm text-muted-foreground">Analyse detaillee des donnees de paie publiees.</p>
      </div>
      <PayrollAnalytics rows={rows} />
    </main>
  );
}

function ForbiddenAnalyticsAccess() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-10">
      <p className="text-sm font-medium text-muted-foreground">Administration RH</p>
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
