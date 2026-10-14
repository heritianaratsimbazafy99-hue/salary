import "server-only";
import { z } from "zod";
import { getCurrentActor, requireCanManageHrReferential } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";
import { HR_LEAVE_STATUSES, HR_LEAVE_TYPES, type HrLeaveStatus, type HrLeaveType } from "./labels";

/** reason/decision_reason are null for team managers (withheld by the database). */
export type LeaveEntry = {
  id: string; agency_id: string; employee_id: string; matricule: string; full_name: string; site_name: string | null;
  leave_type: HrLeaveType; start_date: string; end_date: string; days: number; status: HrLeaveStatus;
  reason: string | null; decision_reason: string | null; decided_by_name: string | null; decided_at: string | null;
  created_at: string; revision: number; balance_days: number | null; total_count: number;
};
export type LeaveBalance = { employee_id: string; balance_days: number; revision: number };
export type BalanceMovement = {
  id: string; employee_id: string; kind: "INITIAL" | "ADJUSTMENT" | "APPROVAL_DEBIT" | "CANCELLATION_CREDIT";
  days: number; balance_after: number; reason: string | null; created_at: string;
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Date invalide");
const revision = z.coerce.number().int().positive();
const CreateInput = z.object({ employeeId: uuid, leaveType: z.enum(HR_LEAVE_TYPES), startDate: day, endDate: day, reason: z.string().trim().min(1).max(2000) })
  .refine((input) => input.endDate >= input.startDate, "La fin doit suivre le début.");
const DecideInput = z.object({ leaveId: uuid, approve: z.boolean(), decisionReason: z.string().trim().max(2000), revision, replacementNeeded: z.boolean().default(false) })
  .refine((input) => input.approve || input.decisionReason.length > 0, "Indiquez le motif du refus.")
  .refine((input) => input.approve || !input.replacementNeeded, "Un remplacement ne se demande qu’à l’approbation.");
const CancelInput = z.object({ leaveId: uuid, reason: z.string().trim().min(3).max(2000), revision });
const AdjustInput = z.object({ employeeId: uuid, kind: z.enum(["INITIAL", "ADJUSTMENT"]), days: z.coerce.number().int().min(-366).max(366).refine((v) => v !== 0, "Nombre de jours non nul."),
  reason: z.string().trim().min(3).max(2000), revision });

const LEAVE_ERRORS: Record<string, string> = {
  insufficient_balance: "Solde de congés insuffisant.",
  outside_contract: "La période doit être comprise dans le contrat.",
  inactive_employee: "Le collaborateur doit être actif.",
  missing_hr_file: "Le dossier RH du collaborateur doit d’abord être créé.",
  no_business_day: "La période ne contient aucun jour ouvré (lundi au vendredi).",
  negative_balance: "Le solde ne peut pas devenir négatif.",
  leave_overlap: "Une demande en attente ou approuvée couvre déjà une partie de cette période.",
  busy_replacing: "Ce collaborateur est confirmé comme remplaçant sur ces dates ; libérez d’abord ce remplacement.",
};
function leaveError(error: { code?: string; message?: string }, fallback: string) {
  return (error.message && LEAVE_ERRORS[error.message]) || hrRpcErrorMessage(error, fallback);
}
function firstIssue(error: z.ZodError, fallback = "Champs invalides.") {
  const message = error.issues[0]?.message;
  return message && !message.startsWith("Invalid") && !message.startsWith("Too") ? message : fallback;
}

export type LeaveQuery = { agencyId?: string; employeeId?: string; status?: string; page?: number };

/** Reads through the caller's session; the database applies role, scope and reason masking. */
export async function listLeaves(query: LeaveQuery = {}): Promise<{ entries: LeaveEntry[]; count: number }> {
  const client = await createClient();
  const page = Math.min(10000, Math.max(1, query.page ?? 1));
  const valid = (value?: string) => (value && uuid.safeParse(value).success ? value : null);
  const { data, error } = await client.rpc("hr_list_leaves", {
    p_agency_id: valid(query.agencyId), p_employee_id: valid(query.employeeId),
    p_status: HR_LEAVE_STATUSES.find((status) => status === query.status) ?? null, p_limit: 50, p_offset: (page - 1) * 50,
  });
  if (error) throw new Error("Impossible de charger les congés.");
  const entries = (data ?? []) as LeaveEntry[];
  return { entries, count: Number(entries[0]?.total_count ?? 0) };
}

export async function getLeaveBalances(employeeIds: string[]): Promise<{ balances: LeaveBalance[]; movements: BalanceMovement[] }> {
  const ids = employeeIds.filter((id) => uuid.safeParse(id).success);
  if (!ids.length) return { balances: [], movements: [] };
  const client = await createClient();
  const [balances, movements] = await Promise.all([
    client.from("leave_balances").select("employee_id,balance_days,revision").in("employee_id", ids),
    client.from("leave_balance_movements").select("id,employee_id,kind,days,balance_after,reason,created_at").in("employee_id", ids).order("created_at", { ascending: false }).limit(50),
  ]);
  if (balances.error || movements.error) throw new Error("Impossible de charger les soldes.");
  return { balances: balances.data ?? [], movements: (movements.data ?? []) as BalanceMovement[] };
}

/** HR for anyone, or an employee for themselves; the RPC re-checks ownership. */
export async function createLeave(input: Record<string, unknown>): Promise<void> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) throw new Error(firstIssue(parsed.error));
  const actor = await getCurrentActor();
  if (!["hr_central", "super_admin", "employee"].includes(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const { error } = await createAdminClient().rpc("hr_create_leave", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_leave_type: parsed.data.leaveType,
    p_start: parsed.data.startDate, p_end: parsed.data.endDate, p_reason: parsed.data.reason,
  });
  if (error) throw new Error(leaveError(error, "Impossible d’enregistrer la demande."));
}

/** HR or a team manager; the RPC checks the employee is in the manager's live scope. */
export async function decideLeave(input: Record<string, unknown>): Promise<void> {
  const parsed = DecideInput.safeParse(input);
  if (!parsed.success) throw new Error(firstIssue(parsed.error));
  const actor = await getCurrentActor();
  if (!["hr_central", "super_admin", "team_manager"].includes(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const { error } = await createAdminClient().rpc("hr_decide_leave", {
    p_actor_id: actor.id, p_leave_id: parsed.data.leaveId, p_approve: parsed.data.approve,
    p_decision_reason: parsed.data.decisionReason, p_revision: parsed.data.revision, p_replacement_needed: parsed.data.replacementNeeded,
  });
  if (error) throw new Error(leaveError(error, "Impossible d’enregistrer la décision."));
}

/** The employee withdraws a pending request; HR may also cancel an approved one. */
export async function cancelLeave(input: Record<string, unknown>): Promise<void> {
  const parsed = CancelInput.safeParse(input);
  if (!parsed.success) throw new Error("Indiquez le motif de l’annulation (3 caractères minimum).");
  const actor = await getCurrentActor();
  if (!["hr_central", "super_admin", "employee"].includes(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const { error } = await createAdminClient().rpc("hr_cancel_leave", {
    p_actor_id: actor.id, p_leave_id: parsed.data.leaveId, p_reason: parsed.data.reason, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(leaveError(error, "Impossible d’annuler la demande."));
}

export async function adjustLeaveBalance(input: Record<string, unknown>): Promise<void> {
  const parsed = AdjustInput.safeParse(input);
  if (!parsed.success) throw new Error(firstIssue(parsed.error, "Indiquez un nombre de jours non nul et un motif."));
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_adjust_leave_balance", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_kind: parsed.data.kind, p_days: parsed.data.days,
    p_reason: parsed.data.reason, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(leaveError(error, "Impossible de corriger le solde."));
}
