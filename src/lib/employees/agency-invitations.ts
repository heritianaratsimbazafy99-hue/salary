import "server-only";
import { createHmac, createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseServiceRoleKey } from "@/lib/env.server";
import { publicEnv } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHrNotificationEmail } from "@/lib/notifications/resend-server";
import type { AgencyScopedActor } from "@/lib/admin/auth";

export const AgencyInvitationSchema = z.object({ employeeIds: z.array(z.uuid()).min(1).max(500), idempotencyKey: z.uuid() }).strict();
export function agencyInvitationToken(jobId: string) {
  return createHmac("sha256", requireSupabaseServiceRoleKey()).update(`agency-invitation/v1/${jobId}`).digest("base64url");
}
export async function processAgencyInvitationJobs(jobIds?: string[]) {
  const admin = createAdminClient();
  let ids = jobIds;
  if (!ids) {
    // The minimal audit event has its separate twelve-month policy. Operational
    // delivery work and expired links do not need an indefinite job history.
    const { error: purgeError } = await admin.from("agency_invitation_jobs").delete().lt("expires_at", new Date().toISOString());
    if (purgeError) throw new Error("Impossible de purger les invitations expirées.");
    const { data, error } = await admin.from("agency_invitation_jobs").select("id").in("status", ["PENDING", "FAILED", "SENDING"]).lt("attempts", 10).gt("expires_at", new Date().toISOString()).order("created_at").limit(40);
    if (error) throw new Error("Impossible de charger les invitations.");
    ids = (data ?? []).map((row) => row.id as string);
  }
  const result = { sent: 0, failed: 0, skipped: 0, pending: 0 };
  const started = Date.now();
  let processed = 0;
  for (const id of ids.slice(0, 20)) {
    if (Date.now() - started > 240_000) break;
    processed++;
    const token = agencyInvitationToken(id);
    const { data, error } = await admin.rpc("claim_agency_invitation", { p_job_id: id, p_token_hash: createHash("sha256").update(token).digest("hex") });
    if (error || !data) {
      if (error?.code === "42501") await admin.from("agency_invitation_jobs").update({ status: "SKIPPED", lease_until: null }).eq("id", id).in("status", ["PENDING", "FAILED", "SENDING"]);
      result.skipped++; continue;
    }
    const url = new URL("/auth/invitation", publicEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    url.searchParams.set("token", token);
    try {
      const response = await sendHrNotificationEmail({ to: data.email, subject: "Bienvenue dans votre espace salarié MadajobPay", html: `<p>Votre espace salarié MadajobPay est prêt à être activé.</p><p><a href="${url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Activer mon espace salarié</a></p><p>Ce lien personnel expire après 14 jours. Un email de vérification vous sera demandé. Vos fiches apparaîtront après leur publication.</p>`, idempotencyKey: `agency-invitation/${id}` });
      if (!response.data?.id || response.error) throw new Error("Email non confirmé.");
      const { error: saveError } = await admin.from("agency_invitation_jobs").update({ status: "SENT", provider_message_id: response.data.id, lease_until: null }).eq("id", id).eq("status", "SENDING");
      if (saveError) throw new Error("Résultat non enregistré.");
      result.sent++;
    } catch {
      await admin.from("agency_invitation_jobs").update({ status: "FAILED", lease_until: null }).eq("id", id).eq("status", "SENDING");
      result.failed++;
    }
  }
  result.pending = ids.length - processed;
  return result;
}
export async function requestAgencyInvitations(actor: AgencyScopedActor, value: unknown) {
  if (actor.role !== "agency_manager") throw new Error("Action non autorisée.");
  const input = AgencyInvitationSchema.parse(value);
  const { data, error } = await createAdminClient().rpc("queue_agency_invitations", { p_actor_id: actor.id, p_agency_id: actor.agencyId, p_employee_ids: input.employeeIds, p_operation_id: input.idempotencyKey });
  if (error) throw new Error("Invitation impossible : vérifiez l’agence, l’état et le délai de renvoi.");
  const ids = z.array(z.uuid()).parse(data);
  const result = await processAgencyInvitationJobs(ids);
  return { ...result, skipped: result.skipped + new Set(input.employeeIds).size - ids.length };
}
