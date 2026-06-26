import "server-only";

import type { AppRole } from "@/lib/roles";

import { createAdminClient } from "@/lib/supabase/admin";

import { sanitizeAuditMetadata } from "./audit";

type AuditEvent = {
  action: string;
  resourceType: string;
  actorProfileId?: string | null;
  actorRole?: AppRole | null;
  agencyId?: string | null;
  employeeId?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    action: event.action,
    actor_profile_id: event.actorProfileId ?? null,
    actor_role: event.actorRole ?? null,
    agency_id: event.agencyId ?? null,
    employee_id: event.employeeId ?? null,
    ip_address: event.ipAddress ?? null,
    metadata: sanitizeAuditMetadata(event.metadata ?? {}),
    resource_id: event.resourceId ?? null,
    resource_type: event.resourceType,
    user_agent: event.userAgent ?? null,
  });

  if (error) {
    throw new Error("Impossible d'enregistrer l'audit.");
  }
}
