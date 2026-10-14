import "server-only";
import { EmployeeIdSchema } from "@/lib/employees/identity";
import { z } from "zod";
import { getCurrentActor, requireCanManageHrReferential } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";
import { HR_CNAPS_STATUSES, HR_CONTRACT_TYPES, HR_EMPLOYEE_STATUSES, type HrCnapsStatus, type HrContractType, type HrEmployeeStatus } from "./labels";

export const DIRECTORY_PAGE_SIZE = 25;

/** Operational row returned by the scoped directory: never private contacts or CNAPS. */
export type DirectoryEntry = {
  employee_id: string; agency_id: string; matricule: string; full_name: string; has_record: boolean;
  job_title: string | null; department_id: string | null; department_name: string | null; site_id: string | null; site_name: string | null;
  team_id: string | null; team_name: string | null; manager_profile_id: string | null; manager_name: string | null;
  status: HrEmployeeStatus | null; contract_type: HrContractType | null; contract_start: string | null; contract_end: string | null;
  revision: number | null; total_count: number;
};
export type PrivateDetails = {
  personal_email: string | null; personal_phone: string | null; postal_address: string | null; emergency_contact: string | null;
  cnaps_number: string | null; cnaps_status: HrCnapsStatus; revision: number;
};
export type EmployeeIdentity = { id: string; agency_id: string; employee_id: string; email: string; full_name: string; is_active: boolean; profile_id: string | null };

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
/** Real calendar day (rejects 2026-02-30). Zod may run refinements after a failed regex, so never throw here. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Date invalide");
const optionalUuid = z.union([uuid, z.literal("")]).transform((value) => value || null);
const RecordFields = z.object({
  jobTitle: z.string().trim().min(1).max(160),
  departmentId: uuid,
  siteId: uuid,
  teamId: optionalUuid,
  managerProfileId: optionalUuid,
  status: z.enum(HR_EMPLOYEE_STATUSES),
  contractType: z.enum(HR_CONTRACT_TYPES),
  contractStart: day,
  contractEnd: z.union([day, z.literal("")]).transform((value) => value || null),
});
// Only a CDD requires an end date; CDI, interim and mission contracts may leave it open.
const contractCheck = (input: { contractType: string; contractStart: string; contractEnd: string | null }) =>
  input.contractType === "CDD" ? !!input.contractEnd && input.contractEnd >= input.contractStart : !input.contractEnd || input.contractEnd >= input.contractStart;
const CONTRACT_MESSAGE = "Contrat invalide : un CDD exige une date de fin, postérieure au début.";
const CreateInput = RecordFields.extend({
  agencyId: uuid,
  matricule: EmployeeIdSchema,
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(1).max(160),
});
const UpdateInput = RecordFields.extend({ employeeId: uuid, revision: z.number().int().positive().nullable() });
const PrivateInput = z.object({
  employeeId: uuid, revision: z.number().int().positive(),
  personalEmail: z.union([z.string().trim().email().max(254), z.literal("")]),
  personalPhone: z.string().trim().max(40), postalAddress: z.string().trim().max(500), emergencyContact: z.string().trim().max(300),
});
const CnapsInput = z.object({ employeeId: uuid, revision: z.number().int().positive(), cnapsNumber: z.string().trim().max(80), cnapsStatus: z.enum(HR_CNAPS_STATUSES) });

export type DirectoryQuery = { agencyId?: string; search?: string; siteId?: string; departmentId?: string; status?: string; employeeId?: string; page?: number; pageSize?: number };

/** Reads the directory through the caller's own session: the database applies role and scope. */
export async function listDirectory(query: DirectoryQuery = {}): Promise<{ entries: DirectoryEntry[]; count: number }> {
  const client = await createClient();
  const page = Math.min(10000, Math.max(1, query.page ?? 1));
  // Pickers may load up to 100 entries at once; listings keep the 25-row page.
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? DIRECTORY_PAGE_SIZE));
  const valid = (value?: string) => (value && uuid.safeParse(value).success ? value : null);
  const status = HR_EMPLOYEE_STATUSES.find((candidate) => candidate === query.status) ?? null;
  const { data, error } = await client.rpc("hr_employee_directory", {
    p_agency_id: valid(query.agencyId), p_search: query.search?.trim().slice(0, 160) || null, p_site_id: valid(query.siteId),
    p_department_id: valid(query.departmentId), p_status: status, p_employee_id: valid(query.employeeId),
    p_limit: pageSize, p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error("Impossible de charger les collaborateurs.");
  const entries = (data ?? []) as DirectoryEntry[];
  return { entries, count: Number(entries[0]?.total_count ?? 0) };
}

/** Payroll employees of an agency that do not have an HR file yet (HR only, through RLS). */
export async function countIncompleteFiles(agencyId: string): Promise<number> {
  await requireCanManageHrReferential();
  if (!uuid.safeParse(agencyId).success) return 0;
  const client = await createClient();
  const { count, error } = await client.from("employees").select("id,employee_hr_records!left(employee_id)", { count: "exact", head: true })
    .eq("agency_id", agencyId).is("employee_hr_records", null);
  if (error) throw new Error("Impossible de compter les dossiers à compléter.");
  return count ?? 0;
}

export type HrEmployeeFile = { identity: EmployeeIdentity; entry: DirectoryEntry; privateDetails: PrivateDetails | null };

/** Complete file for HR (global readers), read through RLS. */
export async function getEmployeeFileForHr(employeeId: string): Promise<HrEmployeeFile | null> {
  await requireCanManageHrReferential();
  if (!uuid.safeParse(employeeId).success) return null;
  const client = await createClient();
  const [identity, directory, privateDetails] = await Promise.all([
    client.from("employees").select("id,agency_id,employee_id,email,full_name,is_active,profile_id").eq("id", employeeId).maybeSingle(),
    listDirectory({ employeeId }),
    client.from("employee_private_details").select("personal_email,personal_phone,postal_address,emergency_contact,cnaps_number,cnaps_status,revision").eq("employee_id", employeeId).maybeSingle(),
  ]);
  if (identity.error || privateDetails.error) throw new Error("Impossible de charger le dossier.");
  if (!identity.data || !directory.entries[0]) return null;
  return { identity: identity.data, entry: directory.entries[0], privateDetails: privateDetails.data };
}

/** The signed-in employee's own file (directory row + private details), never another employee's. */
export async function getOwnEmployeeFiles(): Promise<Array<{ entry: DirectoryEntry; privateDetails: PrivateDetails | null }>> {
  const actor = await getCurrentActor();
  if (actor.role !== "employee") throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const client = await createClient();
  const [{ entries }, privateDetails] = await Promise.all([
    listDirectory(),
    client.from("employee_private_details").select("employee_id,personal_email,personal_phone,postal_address,emergency_contact,cnaps_number,cnaps_status,revision"),
  ]);
  if (privateDetails.error) throw new Error("Impossible de charger votre dossier.");
  return entries.map((entry) => ({ entry, privateDetails: privateDetails.data?.find((row) => row.employee_id === entry.employee_id) ?? null }));
}

/** Team managers eligible as "responsable" in an agency (live, scoped there). */
export async function listManagerOptions(agencyId?: string): Promise<Array<{ id: string; full_name: string; agency_id: string }>> {
  await requireCanManageHrReferential();
  const client = await createClient();
  let query = client.from("hr_scopes").select("agency_id,profile:profiles!inner(id,full_name,role,is_active)").eq("profile.role", "team_manager").eq("profile.is_active", true);
  if (agencyId && uuid.safeParse(agencyId).success) query = query.eq("agency_id", agencyId);
  const { data, error } = await query;
  if (error) throw new Error("Impossible de charger les managers.");
  const managers = new Map<string, { id: string; full_name: string; agency_id: string }>();
  for (const row of data ?? []) {
    const profile = (Array.isArray(row.profile) ? row.profile[0] : row.profile) as { id: string; full_name: string } | undefined;
    if (profile) managers.set(profile.id, { id: profile.id, full_name: profile.full_name, agency_id: row.agency_id });
  }
  return [...managers.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"));
}

function recordParams(data: z.infer<typeof RecordFields>) {
  return {
    p_job_title: data.jobTitle, p_department_id: data.departmentId, p_site_id: data.siteId, p_team_id: data.teamId,
    p_manager_profile_id: data.managerProfileId, p_status: data.status, p_contract_type: data.contractType,
    p_contract_start: data.contractStart, p_contract_end: data.contractEnd,
  };
}

function recordError(error: { code?: string; message?: string }, fallback: string) {
  const messages: Record<string, string> = {
    invalid_department: "Choisissez un département actif de l’agence.",
    invalid_team: "L’équipe doit être active et appartenir au site choisi.",
    invalid_manager: "Le responsable doit être un manager RH actif de cette agence.",
    cnaps_number_required: "Le numéro CNAPS est obligatoire pour le statut « Déclaré ».",
    contract_conflict: "Ce changement de contrat laisserait une affectation ou un remplacement hors contrat.",
  };
  if (error.code === "23505") return "Ce matricule ou cet email existe déjà dans l’agence.";
  return (error.code === "22023" && error.message && messages[error.message]) || hrRpcErrorMessage(error, fallback);
}

/** Form values are untrusted strings; the schema validates and narrows them. */
export async function createEmployee(input: Record<string, unknown>): Promise<string> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  if (!contractCheck(parsed.data)) throw new Error(CONTRACT_MESSAGE);
  const actor = await requireCanManageHrReferential();
  const { data, error } = await createAdminClient().rpc("hr_create_employee", {
    p_actor_id: actor.id, p_agency_id: parsed.data.agencyId, p_matricule: parsed.data.matricule, p_email: parsed.data.email,
    p_full_name: parsed.data.fullName, ...recordParams(parsed.data),
  });
  if (error || typeof data !== "string") throw new Error(error ? recordError(error, "Impossible de créer le dossier.") : "Impossible de créer le dossier.");
  return data;
}

export async function saveEmployeeRecord(input: Record<string, unknown>): Promise<void> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  if (!contractCheck(parsed.data)) throw new Error(CONTRACT_MESSAGE);
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_save_employee_record", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, ...recordParams(parsed.data), p_revision: parsed.data.revision,
  });
  if (error) throw new Error(recordError(error, "Impossible d’enregistrer le dossier."));
}

export async function savePrivateDetails(input: z.input<typeof PrivateInput>): Promise<void> {
  const parsed = PrivateInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_save_private_details", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_personal_email: parsed.data.personalEmail, p_personal_phone: parsed.data.personalPhone,
    p_postal_address: parsed.data.postalAddress, p_emergency_contact: parsed.data.emergencyContact, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(recordError(error, "Impossible d’enregistrer les coordonnées."));
}

export async function updateCnaps(input: Record<string, unknown>): Promise<void> {
  const parsed = CnapsInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  if (parsed.data.cnapsStatus === "DECLARED" && !parsed.data.cnapsNumber) throw new Error("Le numéro CNAPS est obligatoire pour le statut « Déclaré ».");
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_update_cnaps", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_cnaps_number: parsed.data.cnapsNumber, p_cnaps_status: parsed.data.cnapsStatus, p_revision: parsed.data.revision,
  });
  if (error) throw new Error(recordError(error, "Impossible d’enregistrer le suivi CNAPS."));
}
