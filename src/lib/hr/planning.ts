import "server-only";
import { z } from "zod";
import { getCurrentActor } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";

export const HR_ASSIGNMENT_STATUSES = ["PLANNED", "ACTIVE", "ENDED"] as const;
export type HrAssignmentStatus = (typeof HR_ASSIGNMENT_STATUSES)[number];
export type HrReplacementStatus = "OPEN" | "CONFIRMED" | "CANCELLED";

export const ASSIGNMENT_STATUS_LABEL: Record<HrAssignmentStatus, string> = { PLANNED: "Planifiée", ACTIVE: "Active", ENDED: "Terminée" };
export const ASSIGNMENT_STATUS_BADGE: Record<HrAssignmentStatus, string> = { PLANNED: "WARNING", ACTIVE: "ACTIVE", ENDED: "INACTIVE" };
export const REPLACEMENT_STATUS_LABEL: Record<HrReplacementStatus, string> = { OPEN: "À pourvoir", CONFIRMED: "Confirmé", CANCELLED: "Annulé" };
export const REPLACEMENT_STATUS_BADGE: Record<HrReplacementStatus, string> = { OPEN: "WARNING", CONFIRMED: "ACTIVE", CANCELLED: "INACTIVE" };

export type AssignmentEntry = {
  id: string; agency_id: string; employee_id: string; matricule: string; full_name: string; site_id: string; site_name: string;
  team_id: string | null; team_name: string | null; start_date: string; end_date: string | null; status: HrAssignmentStatus; revision: number; total_count: number;
};
export type ReplacementEntry = {
  id: string; agency_id: string; leave_request_id: string; site_id: string; site_name: string; absent_employee_id: string; absent_name: string;
  replacement_employee_id: string | null; replacement_name: string | null; start_date: string; end_date: string; status: HrReplacementStatus; revision: number; total_count: number;
};
export type ReplacementCandidate = { employee_id: string; matricule: string; full_name: string; job_title: string; site_name: string };

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Date invalide");
const optionalUuid = z.union([uuid, z.literal("")]).transform((value) => value || null);
const AssignmentInput = z.object({
  assignmentId: optionalUuid, employeeId: uuid, siteId: uuid, teamId: optionalUuid, startDate: day,
  endDate: z.union([day, z.literal("")]).transform((value) => value || null), status: z.enum(HR_ASSIGNMENT_STATUSES),
  revision: z.union([z.coerce.number().int().positive(), z.literal("")]).transform((value) => (value === "" ? null : value)),
}).refine((input) => !input.endDate || input.endDate >= input.startDate, "La fin doit suivre le début.")
  .refine((input) => input.status !== "ENDED" || !!input.endDate, "Une affectation terminée exige une date de fin.");

const PLANNING_ERRORS: Record<string, string> = {
  assignment_overlap: "Ce collaborateur a déjà une affectation en cours sur une partie de cette période.",
  outside_contract: "La période doit être comprise dans le contrat (une affectation sans fin exige un contrat sans fin).",
  inactive_employee: "Le collaborateur doit être actif.",
  missing_hr_file: "Le dossier RH du collaborateur doit d’abord être créé.",
  invalid_team: "L’équipe doit être active et appartenir au site choisi.",
  inactive_site: "Choisissez un site actif.",
  invalid_candidate: "Ce remplaçant n’est pas éligible (actif, sous contrat sur la période et dans votre périmètre).",
  candidate_absent: "Ce remplaçant a lui-même un congé en attente ou approuvé sur la période.",
  candidate_busy: "Ce remplaçant est déjà confirmé sur un autre remplacement à ces dates.",
  leave_not_approved: "Le congé concerné n’est plus approuvé.",
  contract_conflict: "Ce changement de contrat laisserait une affectation ou un remplacement hors contrat.",
};
export function planningError(error: { code?: string; message?: string }, fallback: string) {
  return (error.message && PLANNING_ERRORS[error.message]) || hrRpcErrorMessage(error, fallback);
}
function requireTeamWriter(role: string) {
  if (!["hr_central", "super_admin", "team_manager"].includes(role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
}

export type AssignmentQuery = { agencyId?: string; siteId?: string; status?: string; employeeId?: string };

export async function listAssignments(query: AssignmentQuery = {}): Promise<{ entries: AssignmentEntry[]; count: number }> {
  const client = await createClient();
  const valid = (value?: string) => (value && uuid.safeParse(value).success ? value : null);
  const { data, error } = await client.rpc("hr_list_assignments", {
    p_agency_id: valid(query.agencyId), p_site_id: valid(query.siteId),
    p_status: HR_ASSIGNMENT_STATUSES.find((status) => status === query.status) ?? null, p_employee_id: valid(query.employeeId), p_limit: 200, p_offset: 0,
  });
  if (error) throw new Error("Impossible de charger les affectations.");
  const entries = (data ?? []) as AssignmentEntry[];
  return { entries, count: Number(entries[0]?.total_count ?? 0) };
}

export async function listReplacements(query: { agencyId?: string; status?: HrReplacementStatus } = {}): Promise<{ entries: ReplacementEntry[]; count: number }> {
  const client = await createClient();
  const { data, error } = await client.rpc("hr_list_replacements", {
    p_agency_id: query.agencyId && uuid.safeParse(query.agencyId).success ? query.agencyId : null, p_status: query.status ?? null, p_limit: 200, p_offset: 0,
  });
  if (error) throw new Error("Impossible de charger les remplacements.");
  const entries = (data ?? []) as ReplacementEntry[];
  return { entries, count: Number(entries[0]?.total_count ?? 0) };
}

export async function listReplacementCandidates(replacementId: string): Promise<ReplacementCandidate[]> {
  if (!uuid.safeParse(replacementId).success) return [];
  const client = await createClient();
  const { data, error } = await client.rpc("hr_replacement_candidates", { p_replacement_id: replacementId });
  if (error) throw new Error("Impossible de charger les remplaçants disponibles.");
  return (data ?? []) as ReplacementCandidate[];
}

/** HR or an in-scope team manager; the RPC checks scope on the employee and the target site. */
export async function saveAssignment(input: Record<string, unknown>): Promise<void> {
  const parsed = AssignmentInput.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    throw new Error(message && /fin|terminée/.test(message) ? message : "Champs invalides.");
  }
  if (parsed.data.assignmentId && !parsed.data.revision) throw new Error("Champs invalides.");
  const actor = await getCurrentActor();
  requireTeamWriter(actor.role);
  const { error } = await createAdminClient().rpc("hr_save_assignment", {
    p_actor_id: actor.id, p_assignment_id: parsed.data.assignmentId, p_employee_id: parsed.data.employeeId, p_site_id: parsed.data.siteId,
    p_team_id: parsed.data.teamId, p_start: parsed.data.startDate, p_end: parsed.data.endDate, p_status: parsed.data.status, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(planningError(error, "Impossible d’enregistrer l’affectation."));
}

export async function confirmReplacement(input: { replacementId: string; replacementEmployeeId: string; revision: string | number }): Promise<void> {
  const parsed = z.object({ replacementId: uuid, replacementEmployeeId: uuid, revision: z.coerce.number().int().positive() }).safeParse(input);
  if (!parsed.success) throw new Error("Choisissez un remplaçant.");
  const actor = await getCurrentActor();
  requireTeamWriter(actor.role);
  const { error } = await createAdminClient().rpc("hr_confirm_replacement", {
    p_actor_id: actor.id, p_replacement_id: parsed.data.replacementId, p_replacement_employee_id: parsed.data.replacementEmployeeId, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(planningError(error, "Impossible de confirmer le remplacement."));
}

export async function cancelReplacement(input: { replacementId: string; revision: string | number }): Promise<void> {
  const parsed = z.object({ replacementId: uuid, revision: z.coerce.number().int().positive() }).safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await getCurrentActor();
  requireTeamWriter(actor.role);
  const { error } = await createAdminClient().rpc("hr_cancel_replacement", { p_actor_id: actor.id, p_replacement_id: parsed.data.replacementId, p_revision: parsed.data.revision });
  if (error) throw new Error(planningError(error, "Impossible d’annuler le besoin de remplacement."));
}
