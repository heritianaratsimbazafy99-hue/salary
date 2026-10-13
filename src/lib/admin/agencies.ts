import "server-only";
import { z } from "zod";
import { getCurrentActor } from "./auth";
import { assertCanManageAgencies } from "./permissions";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

export type Agency = { id: string; name: string; code: string; is_active: boolean };
const AgencyInput = z.object({
  code: z.string().trim().min(1).max(32).transform((code) => code.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  isActive: z.boolean().default(true),
});
export async function listAgencies(): Promise<Agency[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agencies").select("id,name,code,is_active").order("name");
  if (error) throw new Error("Impossible de charger les agences.");
  return data ?? [];
}
export async function saveAgency(input: { id?: string; name: string; code: string; isActive?: boolean }): Promise<void> {
  const parsed = AgencyInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await getCurrentActor();
  assertCanManageAgencies(actor.role);
  const { error } = await createAdminClient().rpc("admin_save_agency", {
    p_actor_id: actor.id, p_agency_id: parsed.data.id ?? null,
    p_name: parsed.data.name, p_code: parsed.data.code, p_active: parsed.data.isActive,
  });
  if (error) throw new Error(error.code === "23505" ? "Ce code agence est déjà utilisé." : "Impossible d'enregistrer l'agence.");
}
export const createAgency = saveAgency;
