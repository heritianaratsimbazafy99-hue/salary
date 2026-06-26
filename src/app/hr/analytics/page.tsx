import { redirect } from "next/navigation";

import { PayrollAnalytics } from "@/components/analytics/PayrollAnalytics";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { PageHeader } from "@/components/shell/PageHeader";
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6">
      <PageHeader
        eyebrow="Administration RH"
        title="Analytics paie"
        description="Analyse détaillée des données de paie publiées sur l'ensemble des agences."
      />
      <PayrollAnalytics rows={rows} />
    </main>
  );
}

function ForbiddenAnalyticsAccess() {
  return <AccessDenied context="Administration RH" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
