import "server-only";
import { z } from "zod";
import { getCurrentActor } from "./auth";
import { assertCanAssignAgencyManager } from "./permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";

export type AgencyManagerProfile = {
  id: string; email: string; full_name: string; role: "agency_manager"; is_active: boolean;
  agency_memberships: { agency_id: string }[];
};
export type EmployeeAccess = { id: string; employee_id: string; full_name: string; email: string; agency_id: string; is_active: boolean };
const ManagerInput = z.object({
  agencyId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
});
async function requireAdministrator() {
  const actor = await getCurrentActor();
  assertCanAssignAgencyManager(actor.role);
  return actor;
}
export async function listAgencyManagers(): Promise<AgencyManagerProfile[]> {
  await requireAdministrator();
  const client = await createClient();
  const { data, error } = await client.from("profiles")
    .select("id,email,full_name,role,is_active,agency_memberships(agency_id)").eq("role", "agency_manager").order("full_name");
  if (error) throw new Error("Impossible de charger les responsables.");
  return (data ?? []).map((row) => {
    // The unique profile_id foreign key makes this a one-to-one relation in
    // PostgREST. Normalize both shapes so forms retain the current assignment.
    const memberships: unknown = row.agency_memberships;
    const relations = Array.isArray(memberships) ? memberships : memberships ? [memberships] : [];
    return { ...row, agency_memberships: relations } as AgencyManagerProfile;
  });
}
export async function listEmployeeAccess(agencyId?: string, search?: string, page = 1): Promise<{ employees: EmployeeAccess[]; count: number }> {
  await requireAdministrator();
  const client = await createClient();
  let query = client.from("employees").select("id,employee_id,full_name,email,agency_id,is_active", { count: "exact" }).order("full_name").order("id");
  if (agencyId && z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(agencyId).success) query = query.eq("agency_id", agencyId);
  // Escaping LIKE syntax keeps search literal and avoids PostgREST filter injection.
  if (search?.trim()) query = query.ilike("full_name", `%${search.trim().replace(/[\\%_]/g, "\\$&").slice(0, 160)}%`);
  const { data, error, count } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Impossible de charger les salariés.");
  return { employees: data ?? [], count: count ?? 0 };
}
export async function createAgencyManager(input: { email: string; fullName: string; agencyId: string }): Promise<void> {
  const parsed = ManagerInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireAdministrator();
  const admin = createAdminClient();
  const { data: agency, error: agencyError } = await admin.from("agencies").select("is_active").eq("id", parsed.data.agencyId).single();
  if (agencyError || !agency?.is_active) throw new Error("Sélectionnez une agence active.");
  const { data, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email, email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (authError || !data.user) throw new Error("Impossible de créer le responsable. Vérifiez que cette adresse n'est pas déjà utilisée.");
  const { error } = await admin.rpc("admin_save_manager", {
    p_actor_id: actor.id, p_profile_id: null, p_auth_user_id: data.user.id,
    p_email: parsed.data.email, p_name: parsed.data.fullName, p_agency_id: parsed.data.agencyId, p_active: true,
  });
  if (error) {
    // A PostgreSQL error confirms rollback. A transport failure is ambiguous: keep
    // the identity rather than deleting an account whose transaction may have committed.
    if (/^[0-9A-Z]{5}$/.test(error.code ?? "")) {
      await admin.auth.admin.deleteUser(data.user.id);
    }
    throw new Error("Impossible de créer le responsable d'agence.");
  }
}
export async function updateAgencyManager(input: { id: string; fullName: string; agencyId: string; isActive: boolean }): Promise<void> {
  const parsed = ManagerInput.omit({ email: true }).extend({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireAdministrator();
  const { error } = await createAdminClient().rpc("admin_save_manager", {
    p_actor_id: actor.id, p_profile_id: parsed.data.id, p_auth_user_id: null, p_email: null,
    p_name: parsed.data.fullName, p_agency_id: parsed.data.agencyId, p_active: parsed.data.isActive,
  });
  if (error) throw new Error("Impossible de modifier le responsable. Pour activer son accès, choisissez une agence active.");
}
export async function setEmployeeAccess(input: { id: string; isActive: boolean }): Promise<void> {
  const parsed = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireAdministrator();
  const { error } = await createAdminClient().rpc("admin_set_employee_access", {
    p_actor_id: actor.id, p_employee_id: parsed.data.id, p_active: parsed.data.isActive,
  });
  if (error) throw new Error("Impossible de modifier l'accès. Vérifiez que l'agence est active avant une réactivation.");
}
