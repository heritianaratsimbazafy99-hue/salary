import "server-only";
import { z } from "zod";
import { requireCanManageHrReferential } from "../admin/auth";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";

export type HrSite = { id: string; agency_id: string; name: string; code: string; is_active: boolean; revision: number };
export type HrDepartment = { id: string; agency_id: string; name: string; is_active: boolean; revision: number };
export type HrTeam = { id: string; agency_id: string; site_id: string; name: string; is_active: boolean; revision: number };
export type HrReferential = { sites: HrSite[]; departments: HrDepartment[]; teams: HrTeam[] };

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const name = z.string().trim().min(1).max(160);
const existing = { id: uuid.optional(), revision: z.number().int().positive().optional(), isActive: z.boolean() };
const SiteInput = z.object({ ...existing, agencyId: uuid, name, code: z.string().trim().min(1).max(32).transform((code) => code.toUpperCase()) });
const DepartmentInput = z.object({ ...existing, agencyId: uuid, name });
const TeamInput = z.object({ ...existing, siteId: uuid, name });

/** Reads through RLS: each role only receives the referential of its own scope. */
export async function listHrReferential(agencyId?: string): Promise<HrReferential> {
  const client = await createClient();
  const filter = agencyId && uuid.safeParse(agencyId).success ? agencyId : null;
  let sitesQuery = client.from("hr_sites").select("id,agency_id,name,code,is_active,revision").order("name");
  let departmentsQuery = client.from("hr_departments").select("id,agency_id,name,is_active,revision").order("name");
  let teamsQuery = client.from("hr_teams").select("id,agency_id,site_id,name,is_active,revision").order("name");
  if (filter) {
    sitesQuery = sitesQuery.eq("agency_id", filter);
    departmentsQuery = departmentsQuery.eq("agency_id", filter);
    teamsQuery = teamsQuery.eq("agency_id", filter);
  }
  const [sites, departments, teams] = await Promise.all([sitesQuery, departmentsQuery, teamsQuery]);
  if (sites.error || departments.error || teams.error) throw new Error("Impossible de charger l’organisation RH.");
  return { sites: sites.data ?? [], departments: departments.data ?? [], teams: teams.data ?? [] };
}

function requireRevision(input: { id?: string; revision?: number }) {
  if (input.id && !input.revision) throw new Error("Champs invalides.");
}

export async function saveHrSite(input: z.input<typeof SiteInput>): Promise<void> {
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  requireRevision(parsed.data);
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_save_site", {
    p_actor_id: actor.id, p_site_id: parsed.data.id ?? null, p_agency_id: parsed.data.agencyId,
    p_name: parsed.data.name, p_code: parsed.data.code, p_active: parsed.data.isActive, p_revision: parsed.data.revision ?? null,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible d’enregistrer le site."));
}

export async function saveHrDepartment(input: z.input<typeof DepartmentInput>): Promise<void> {
  const parsed = DepartmentInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  requireRevision(parsed.data);
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_save_department", {
    p_actor_id: actor.id, p_department_id: parsed.data.id ?? null, p_agency_id: parsed.data.agencyId,
    p_name: parsed.data.name, p_active: parsed.data.isActive, p_revision: parsed.data.revision ?? null,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible d’enregistrer le département."));
}

export async function saveHrTeam(input: z.input<typeof TeamInput>): Promise<void> {
  const parsed = TeamInput.safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  requireRevision(parsed.data);
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_save_team", {
    p_actor_id: actor.id, p_team_id: parsed.data.id ?? null, p_site_id: parsed.data.siteId,
    p_name: parsed.data.name, p_active: parsed.data.isActive, p_revision: parsed.data.revision ?? null,
  });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible d’enregistrer l’équipe."));
}
