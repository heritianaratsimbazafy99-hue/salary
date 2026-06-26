import { redirect } from "next/navigation";

import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadRecentAuditLogs } from "@/lib/audit/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  try {
    await requireCanReadPayrollAnalytics();
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administration RH</p>
        <h1 className="mt-2 text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="mt-2 text-sm text-muted-foreground">Suivi des actions sensibles.</p>
      </header>
      <AuditLogTable logs={logs} />
    </main>
  );
}

function ForbiddenAuditAccess() {
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
