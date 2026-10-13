import "server-only";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { getCurrentActor } from "@/lib/admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { isSentryEnabled } from "@/lib/sentry-options";
import { createClient } from "@/lib/supabase/server";

const SMOKE_ACTION = "MONITORING_SMOKE_REQUESTED";
const COOLDOWN_MS = 15 * 60 * 1000;

export async function runMonitoringSmoke(): Promise<{ eventId: string; flushed: boolean }> {
  const actor = await getCurrentActor();
  if (actor.role !== "super_admin") throw new Error(FORBIDDEN_ERROR_MESSAGE);
  if (!isSentryEnabled() || !Sentry.isEnabled()) {
    throw new Error("La supervision Sentry n'est pas configurée.");
  }

  // Read with the caller's session and RLS; fail closed if audit is unavailable.
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs")
    .select("id")
    .eq("action", SMOKE_ACTION)
    .gte("created_at", new Date(Date.now() - COOLDOWN_MS).toISOString())
    .limit(1);
  if (error) throw new Error("Impossible de vérifier le dernier test de supervision.");
  if (data?.length) throw new Error("Un test a déjà été lancé. Patientez quinze minutes avant de réessayer.");

  // resource_id is a UUID; the corresponding Sentry ID has no hyphens.
  const resourceId = randomUUID();
  const eventId = resourceId.replaceAll("-", "");
  await recordAuditEvent({
    action: SMOKE_ACTION,
    actorProfileId: actor.id,
    actorRole: actor.role,
    resourceType: "monitoring_smoke",
    resourceId,
  });

  Sentry.withScope((scope) => {
    scope.clear();
    scope.setTag("purpose", "launch_smoke");
    scope.setTag("source", "operations");
    Sentry.captureException(new Error("Salary monitoring smoke test"), { event_id: eventId });
  });
  const flushed = await Sentry.flush(5000);
  return { eventId, flushed };
}
