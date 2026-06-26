import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseReadClient = Pick<SupabaseClient, "from">;

type AuditLogDbRow = {
  action?: unknown;
  actor_role?: unknown;
  created_at?: unknown;
  id?: unknown;
  resource_type?: unknown;
};

export type AuditLogRow = {
  id: string;
  actorRole: string | null;
  action: string;
  resourceType: string;
  createdAt: string;
};

const AUDIT_LOG_COLUMNS = "id,actor_role,action,resource_type,created_at";

export async function loadRecentAuditLogs(
  supabase: SupabaseReadClient,
  limit = 50,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select(AUDIT_LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error("Impossible de charger le journal d'audit.");
  }

  return ((data ?? []) as AuditLogDbRow[]).map(mapAuditLogRow);
}

function mapAuditLogRow(row: AuditLogDbRow): AuditLogRow {
  return {
    action: requiredString(row.action),
    actorRole: nullableString(row.actor_role),
    createdAt: requiredString(row.created_at),
    id: requiredString(row.id),
    resourceType: requiredString(row.resource_type),
  };
}

function requiredString(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error("Journal d'audit invalide.");
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value);
}
