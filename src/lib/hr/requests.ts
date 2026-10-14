import "server-only";
import { z } from "zod";
import { getCurrentActor, requireCanManageHrReferential } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";

export const HR_REQUEST_CATEGORIES = ["CONTRACT", "PAYROLL", "LEAVE", "ADMINISTRATIVE", "OTHER"] as const;
export type HrRequestCategory = (typeof HR_REQUEST_CATEGORIES)[number];
export const HR_REQUEST_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type HrRequestStatus = (typeof HR_REQUEST_STATUSES)[number];
export const REQUEST_CATEGORY_LABEL: Record<HrRequestCategory, string> = { CONTRACT: "Contrat", PAYROLL: "Paie", LEAVE: "Congés", ADMINISTRATIVE: "Administratif", OTHER: "Autre" };
export const REQUEST_STATUS_LABEL: Record<HrRequestStatus, string> = { OPEN: "Ouverte", IN_PROGRESS: "En cours", RESOLVED: "Résolue" };
export const REQUEST_STATUS_BADGE: Record<HrRequestStatus, string> = { OPEN: "WARNING", IN_PROGRESS: "READY_FOR_PREVIEW", RESOLVED: "ACTIVE" };

export type HrRequest = {
  id: string; agency_id: string; employee_id: string; category: HrRequestCategory; subject: string; message: string; status: HrRequestStatus;
  reply: string | null; replied_at: string | null; created_at: string; revision: number;
  employee: { full_name: string; employee_id: string } | null;
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const CreateInput = z.object({ employeeId: uuid, category: z.enum(HR_REQUEST_CATEGORIES), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(4000) });
const ReplyInput = z.object({ requestId: uuid, reply: z.string().trim().min(1).max(4000), status: z.enum(["IN_PROGRESS", "RESOLVED"]), revision: z.coerce.number().int().positive() });

/** RLS returns HR everything and the employee their own requests; nobody else sees any. */
export async function listRequests(query: { agencyId?: string; status?: string } = {}): Promise<HrRequest[]> {
  const client = await createClient();
  let request = client.from("hr_requests")
    .select("id,agency_id,employee_id,category,subject,message,status,reply,replied_at,created_at,revision,employee:employees!hr_requests_employee_agency_fk(full_name,employee_id)")
    .order("created_at", { ascending: false }).limit(200);
  if (query.agencyId && uuid.safeParse(query.agencyId).success) request = request.eq("agency_id", query.agencyId);
  const status = HR_REQUEST_STATUSES.find((value) => value === query.status);
  if (status) request = request.eq("status", status);
  const { data, error } = await request;
  if (error) throw new Error("Impossible de charger les demandes.");
  return (data ?? []).map((row) => ({ ...row, employee: Array.isArray(row.employee) ? row.employee[0] ?? null : row.employee })) as HrRequest[];
}

export async function createRequest(input: Record<string, unknown>): Promise<void> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) throw new Error("Indiquez une catégorie, un sujet et votre message.");
  const actor = await getCurrentActor();
  if (!["hr_central", "super_admin", "employee"].includes(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const { error } = await createAdminClient().rpc("hr_create_request", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_category: parsed.data.category, p_subject: parsed.data.subject, p_message: parsed.data.message,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible d’envoyer la demande."));
}

export async function replyRequest(input: Record<string, unknown>): Promise<void> {
  const parsed = ReplyInput.safeParse(input);
  if (!parsed.success) throw new Error("Rédigez une réponse et choisissez le statut.");
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_reply_request", {
    p_actor_id: actor.id, p_request_id: parsed.data.requestId, p_reply: parsed.data.reply, p_status: parsed.data.status, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible d’enregistrer la réponse."));
}
