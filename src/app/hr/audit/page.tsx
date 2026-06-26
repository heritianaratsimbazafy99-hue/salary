import { redirect } from "next/navigation";

import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadRecentAuditLogs } from "@/lib/audit/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  let actor: Awaited<ReturnType<typeof requireCanReadPayrollAnalytics>>;

  try {
    actor = await requireCanReadPayrollAnalytics();
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return <ForbiddenAuditAccess />;
    }

    throw error;
  }

  const supabase = await createClient();
  const logs = await loadRecentAuditLogs(supabase);

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Administration RH"
          title="Journal d'audit"
          description="Suivi des actions sensibles réalisées sur la plateforme."
        />
        <AuditLogTable logs={logs} />
      </div>
    </AppShell>
  );
}

function ForbiddenAuditAccess() {
  return <AccessDenied context="Administration RH" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
