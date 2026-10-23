import "server-only";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeImportReport } from "./import-schema";
import { parseEmployeeImport } from "./import-parser";

export async function requireEmployeeImportActor() {
  const actor = await getCurrentAgencyScopedActor();
  if (actor.role !== "agency_manager") throw new Error(FORBIDDEN_ERROR_MESSAGE);
  return actor;
}
export async function previewEmployeeImport(file: File) {
  const actor = await requireEmployeeImportActor();
  const rows = await parseEmployeeImport(file);
  const { data, error } = await createAdminClient().rpc("agency_preview_employee_import", { p_actor_id: actor.id, p_agency_id: actor.agencyId, p_rows: rows });
  if (error) throw error;
  return data as string;
}
export async function listEmployeeImports() {
  const actor = await requireEmployeeImportActor();
  const client = await createClient();
  const { data, error } = await client.from("employee_imports").select("id,status,created_at,expires_at,created_count").eq("agency_id", actor.agencyId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data as Pick<EmployeeImportReport, "id" | "status" | "created_at" | "expires_at" | "created_count">[];
}
export async function getEmployeeImport(id: string): Promise<EmployeeImportReport | null> {
  const actor = await requireEmployeeImportActor();
  const client = await createClient();
  const { data, error } = await client.from("employee_imports").select("id,status,fingerprint,created_at,expires_at,committed_at,created_count,employee_import_rows(row_number,matricule,nom_complet,email,issues,classification,employee_uuid,expected_revision)").eq("id", id).eq("agency_id", actor.agencyId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { employee_import_rows: rows, ...report } = data;
  return { ...report, rows: rows.sort((a, b) => a.row_number - b.row_number) } as EmployeeImportReport;
}
export async function reviewEmployeeImport(id: string, fingerprint: string, excluded: number[]) {
  const actor = await requireEmployeeImportActor();
  const { error } = await createAdminClient().rpc("agency_review_employee_import", { p_actor_id: actor.id, p_import_id: id, p_fingerprint: fingerprint, p_excluded: excluded });
  if (error) throw error;
}
export async function commitEmployeeImport(id: string, fingerprint: string) {
  const actor = await requireEmployeeImportActor();
  const { data, error } = await createAdminClient().rpc("agency_commit_employee_import", { p_actor_id: actor.id, p_import_id: id, p_fingerprint: fingerprint });
  if (error) throw error;
  return data as number;
}
