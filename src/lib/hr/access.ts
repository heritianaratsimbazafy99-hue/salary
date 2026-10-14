import "server-only";
import { z } from "zod";
import { getCurrentActor, requireCanAdministerHrAccess } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { HR_SCOPED_ROLES, isHrScopedRole, type HrScopedRole } from "../roles";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";

export type HrScope = { agency_id: string; department_id: string | null; site_id: string | null };
export type HrAccessProfile = {
  id: string; email: string; full_name: string; role: HrScopedRole; is_active: boolean; updated_at: string; hr_scopes: HrScope[];
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const ScopeSelection = z.object({
  role: z.enum(HR_SCOPED_ROLES),
  fullName: z.string().trim().min(1).max(160),
  departmentIds: z.array(uuid).max(50).default([]),
  siteIds: z.array(uuid).max(50).default([]),
});
const CreateInput = ScopeSelection.extend({ email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()) });
const UpdateInput = ScopeSelection.extend({ id: uuid, isActive: z.boolean(), updatedAt: z.string().min(1).max(64) });

export async function listHrAccessProfiles(): Promise<HrAccessProfile[]> {
  await requireCanAdministerHrAccess();
  const client = await createClient();
  const { data, error } = await client.from("profiles")
    .select("id,email,full_name,role,is_active,updated_at,hr_scopes(agency_id,department_id,site_id)")
    .in("role", [...HR_SCOPED_ROLES]).order("full_name");
  if (error) throw new Error("Impossible de charger les accès RH.");
  return (data ?? []).filter((row) => isHrScopedRole(row.role)) as HrAccessProfile[];
}

/**
 * Builds scope rows from the form selection. A team manager with departments and
 * sites receives their intersection (department × site), as in the reference
 * portal; a client viewer only receives sites. The RPC re-validates everything.
 */
async function buildScopes(selection: z.infer<typeof ScopeSelection>): Promise<HrScope[]> {
  const departmentIds = [...new Set(selection.departmentIds)];
  const siteIds = [...new Set(selection.siteIds)];
  if (selection.role === "client_viewer" && (!siteIds.length || departmentIds.length)) {
    throw new Error("Un accès client exige au moins un site, sans département.");
  }
  if (!departmentIds.length && !siteIds.length) throw new Error("Choisissez au moins un site ou un département.");
  const admin = createAdminClient();
  const [departments, sites] = await Promise.all([
    departmentIds.length ? admin.from("hr_departments").select("id,agency_id").in("id", departmentIds) : { data: [], error: null },
    siteIds.length ? admin.from("hr_sites").select("id,agency_id").in("id", siteIds) : { data: [], error: null },
  ]);
  if (departments.error || sites.error) throw new Error("Impossible de vérifier le périmètre.");
  const agencies = new Set([...(departments.data ?? []), ...(sites.data ?? [])].map((row) => row.agency_id));
  if (agencies.size !== 1 || (departments.data ?? []).length !== departmentIds.length || (sites.data ?? []).length !== siteIds.length) {
    throw new Error("Choisissez des sites et départements d’une seule agence.");
  }
  const [agencyId] = agencies;
  const scopes = !departmentIds.length
    ? siteIds.map((siteId) => ({ agency_id: agencyId, department_id: null, site_id: siteId }))
    : !siteIds.length
      ? departmentIds.map((departmentId) => ({ agency_id: agencyId, department_id: departmentId, site_id: null }))
      : departmentIds.flatMap((departmentId) => siteIds.map((siteId) => ({ agency_id: agencyId, department_id: departmentId, site_id: siteId })));
  if (scopes.length > 50) throw new Error("Périmètre trop large : 50 combinaisons au maximum.");
  return scopes;
}

export async function createHrAccess(input: z.input<typeof CreateInput>): Promise<void> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireCanAdministerHrAccess();
  const scopes = await buildScopes(parsed.data);
  const admin = createAdminClient();
  const { data, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email, email_confirm: true, user_metadata: { full_name: parsed.data.fullName },
  });
  if (authError || !data.user) throw new Error("Impossible de créer l’accès. Vérifiez que cette adresse n’est pas déjà utilisée.");
  const { error } = await admin.rpc("admin_save_hr_access", {
    p_actor_id: actor.id, p_profile_id: null, p_auth_user_id: data.user.id, p_email: parsed.data.email,
    p_name: parsed.data.fullName, p_role: parsed.data.role, p_active: true, p_scopes: scopes, p_expected_updated_at: null,
  });
  if (error) {
    // A PostgreSQL error confirms rollback; a transport failure is ambiguous, so
    // the identity is kept rather than deleting an account that may be committed.
    if (/^[0-9A-Z]{5}$/.test(error.code ?? "")) await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(hrRpcErrorMessage(error, "Impossible de créer l’accès."));
  }
}

export async function updateHrAccess(input: z.input<typeof UpdateInput>): Promise<void> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireCanAdministerHrAccess();
  const scopes = await buildScopes(parsed.data);
  const { error } = await createAdminClient().rpc("admin_save_hr_access", {
    p_actor_id: actor.id, p_profile_id: parsed.data.id, p_auth_user_id: null, p_email: null, p_name: parsed.data.fullName,
    p_role: parsed.data.role, p_active: parsed.data.isActive, p_scopes: scopes, p_expected_updated_at: parsed.data.updatedAt,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible de modifier l’accès."));
}

export async function setHrAccessActive(input: { id: string; isActive: boolean; updatedAt: string }): Promise<void> {
  const parsed = z.object({ id: uuid, isActive: z.boolean(), updatedAt: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireCanAdministerHrAccess();
  const { error } = await createAdminClient().rpc("admin_set_hr_access_active", {
    p_actor_id: actor.id, p_profile_id: parsed.data.id, p_active: parsed.data.isActive, p_expected_updated_at: parsed.data.updatedAt,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible de modifier l’accès."));
}

export type CurrentHrScope = {
  actor: { id: string; role: HrScopedRole };
  agency: { id: string; name: string } | null;
  sites: { id: string; name: string; code: string }[];
  departments: { id: string; name: string }[];
  scopes: HrScope[];
};

/** Scope of the signed-in team manager or client viewer, read through RLS. */
export async function getCurrentHrScope(): Promise<CurrentHrScope> {
  const actor = await getCurrentActor();
  if (!isHrScopedRole(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const client = await createClient();
  const { data: scopes, error } = await client.from("hr_scopes").select("agency_id,department_id,site_id").eq("profile_id", actor.id);
  if (error || !scopes?.length) throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const agencyId = scopes[0].agency_id;
  const siteIds = [...new Set(scopes.map((scope) => scope.site_id).filter((id): id is string => !!id))];
  const departmentIds = [...new Set(scopes.map((scope) => scope.department_id).filter((id): id is string => !!id))];
  const [agency, sites, departments] = await Promise.all([
    client.from("agencies").select("id,name").eq("id", agencyId).maybeSingle(),
    siteIds.length ? client.from("hr_sites").select("id,name,code").in("id", siteIds).eq("is_active", true).order("name") : { data: [], error: null },
    departmentIds.length ? client.from("hr_departments").select("id,name").in("id", departmentIds).eq("is_active", true).order("name") : { data: [], error: null },
  ]);
  if (agency.error || sites.error || departments.error) throw new Error("Impossible de charger votre périmètre.");
  return { actor: { id: actor.id, role: actor.role }, agency: agency.data ?? null, sites: sites.data ?? [], departments: departments.data ?? [], scopes };
}
