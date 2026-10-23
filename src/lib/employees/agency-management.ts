import "server-only";
import { getCurrentAgencyScopedActor, requireCanManageHrReferential } from "@/lib/admin/auth";
import { assertCanManageAgencyEmployees } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hrRpcErrorMessage } from "@/lib/hr/errors";
import { AgencyCreateSchema, AgencyDecisionSchema, AgencyDepartureSchema, AgencyRequestSchema, AgencyUpdateSchema, AgencyUuid } from "./agency-schemas";
export type AgencyEmployee = { id: string; agency_id: string; matricule: string; email: string; full_name: string; is_active: boolean; has_access: boolean; revision: number; state: "CURRENT" | "DEPARTED" | "TO_REVIEW"; lifecycle_revision: number; operational_revision: number; started_on: string | null; departed_on: string | null; departure_reason: string | null; has_hr_record: boolean; job_title: string | null; department_id: string | null; department_name: string | null; site_id: string | null; site_name: string | null; team_id: string | null; team_name: string | null; manager_profile_id: string | null; manager_name: string | null; contract_type: string | null; contract_start: string | null; contract_end: string | null; total_count: number };
export type AgencyOptions = { departments: { id: string; name: string }[]; sites: { id: string; name: string }[]; teams: { id: string; name: string; site_id: string }[]; managers: { id: string; full_name: string }[] };
export type AgencyChangeRequest = { id: string; employee_id: string; agency_id: string; kind: "RETURN" | "EMAIL" | "MATRICULE" | "MANAGER"; requested_value: string; reason: string; status: string; revision: number; created_at: string; employee_name: string; matricule: string; agency_name: string; created_by_name: string; current_value: string | null; requested_display_value: string | null; departed_on: string | null; contract_type: string | null; contract_start: string | null; contract_end: string | null; decision_reason: string | null };
export type AgencyEvent = { id: string; action: string; actor_profile_id: string; actor_name: string | null; actor_role: string; created_at: string; result: string };
export async function requireAgencyEmployeeActor() { const actor = await getCurrentAgencyScopedActor(); assertCanManageAgencyEmployees({ role: actor.role, actorAgencyId: actor.agencyId, requestedAgencyId: actor.agencyId }); return actor; }
function rpcError(error: { code?: string; message?: string }, fallback: string): Error {
  if (error.code === "23505") return new Error("Ce matricule ou cet email existe déjà dans l’agence.");
  if (error.message === "lifecycle_conflict") return new Error("Ce départ est bloqué par des affectations ou remplacements. Demandez aux RH de résoudre les conflits avant de recommencer.");
  return new Error(hrRpcErrorMessage(error, fallback));
}
export async function listAgencyEmployees(query: { search?: string; state?: string; page?: number; employeeId?: string } = {}) {
  const actor = await requireAgencyEmployeeActor();
  const client = await createClient();
  const page = Math.min(10000, Math.max(1, Math.trunc(query.page ?? 1) || 1));
  const { data, error } = await client.rpc("agency_employee_directory", { p_agency_id: actor.agencyId, p_search: query.search?.trim().slice(0, 160) || null, p_state: ["CURRENT", "DEPARTED", "TO_REVIEW"].includes(query.state ?? "") ? query.state : null, p_employee_id: query.employeeId && AgencyUuid.safeParse(query.employeeId).success ? query.employeeId : null, p_limit: 25, p_offset: (page - 1) * 25 });
  if (error) throw rpcError(error, "Impossible de charger les salariés.");
  const entries = (data ?? []) as AgencyEmployee[]; return { entries, count: Number(entries[0]?.total_count ?? 0), page };
}
export async function getAgencyEmployee(employeeId: string) {
  if (!AgencyUuid.safeParse(employeeId).success) return null;
  const directory = await listAgencyEmployees({ employeeId }); return directory.entries[0] ?? null;
}
export async function getAgencyEmployeeOptions() {
  const actor = await requireAgencyEmployeeActor(); const client = await createClient();
  const { data, error } = await client.rpc("agency_employee_options", { p_agency_id: actor.agencyId });
  if (error) throw rpcError(error, "Impossible de charger les références."); return data as AgencyOptions;
}
export async function listAgencyChangeRequests(employeeId?: string): Promise<AgencyChangeRequest[]> {
  if (employeeId) { await requireAgencyEmployeeActor(); if (!AgencyUuid.safeParse(employeeId).success) throw new Error("Salarié invalide."); }
  else await requireCanManageHrReferential();
  const client = await createClient(); const { data, error } = await client.rpc("agency_employee_requests", { p_employee_id: employeeId ?? null });
  if (error) throw rpcError(error, "Impossible de charger les demandes."); return (data ?? []) as AgencyChangeRequest[];
}
export async function listAgencyEmployeeHistory(employeeId: string): Promise<AgencyEvent[]> {
  await requireAgencyEmployeeActor(); if (!AgencyUuid.safeParse(employeeId).success) throw new Error("Salarié invalide.");
  const client = await createClient(); const { data, error } = await client.rpc("agency_employee_history", { p_employee_id: employeeId });
  if (error) throw rpcError(error, "Impossible de charger l’historique."); return (data ?? []) as AgencyEvent[];
}
export async function createAgencyEmployee(input: Record<string, unknown>): Promise<string> {
  const parsed = AgencyCreateSchema.safeParse(input); if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireAgencyEmployeeActor(); const { data, error } = await createAdminClient().rpc("agency_create_employee", { p_actor_id: actor.id, p_agency_id: actor.agencyId, p_matricule: parsed.data.matricule, p_email: parsed.data.email, p_full_name: parsed.data.fullName });
  if (error || typeof data !== "string") throw error ? rpcError(error, "Création impossible.") : new Error("Création impossible."); return data;
}
export async function saveAgencyEmployee(input: Record<string, unknown>): Promise<void> {
  const parsed = AgencyUpdateSchema.safeParse(input); if (!parsed.success) throw new Error("Champs invalides."); const actor = await requireAgencyEmployeeActor(); const d = parsed.data;
  const { error } = await createAdminClient().rpc("agency_save_employee", { p_actor_id: actor.id, p_employee_id: d.employeeId, p_revision: d.identityRevision, p_operational_revision: d.operationalRevision, p_full_name: d.fullName, p_job_title: d.jobTitle || null, p_department_id: d.departmentId, p_site_id: d.siteId, p_team_id: d.teamId, p_reason: d.reason }); if (error) throw rpcError(error, "Enregistrement impossible. Vérifiez les références actives et l’équipe du site choisi.");
}
export async function departAgencyEmployee(input: Record<string, unknown>): Promise<void> {
  const parsed = AgencyDepartureSchema.safeParse(input); if (!parsed.success) throw new Error("Date ou motif invalide. Le départ doit être daté du jour ou du passé."); const actor = await requireAgencyEmployeeActor(); const d = parsed.data;
  const { error } = await createAdminClient().rpc("agency_depart_employee", { p_actor_id: actor.id, p_employee_id: d.employeeId, p_revision: d.identityRevision, p_lifecycle_revision: d.lifecycleRevision, p_departed_on: d.departedOn, p_reason: d.reason }); if (error) throw rpcError(error, "Départ impossible.");
}
export async function requestAgencyEmployeeChange(input: Record<string, unknown>): Promise<void> {
  const parsed = AgencyRequestSchema.safeParse(input); if (!parsed.success) throw new Error("Demande invalide. Vérifiez la nouvelle valeur et le motif."); const actor = await requireAgencyEmployeeActor(); const d = parsed.data;
  const value = d.type === "EMAIL" ? d.value.toLowerCase() : d.type === "MATRICULE" ? AgencyCreateSchema.shape.matricule.parse(d.value) : d.value;
  const { error } = await createAdminClient().rpc("agency_request_employee_change", { p_actor_id: actor.id, p_employee_id: d.employeeId, p_revision: d.identityRevision, p_lifecycle_revision: d.lifecycleRevision, p_kind: d.type, p_requested_value: value, p_reason: d.reason }); if (error) throw rpcError(error, "Demande impossible.");
}
export async function decideAgencyEmployeeChange(input: Record<string, unknown>): Promise<void> {
  const parsed = AgencyDecisionSchema.safeParse(input); if (!parsed.success) throw new Error("Décision invalide. Un motif est obligatoire."); const actor = await requireCanManageHrReferential(); const d = parsed.data;
  const { error } = await createAdminClient().rpc("hr_decide_employee_change", { p_actor_id: actor.id, p_request_id: d.requestId, p_revision: d.revision, p_approve: d.decision === "APPROVE", p_reason: d.reason }); if (error) throw rpcError(error, "Décision impossible. Vérifiez les collisions et l’éligibilité du Manager RH.");
}
