import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { getPublicSupabaseConfig } from "@/lib/env.public";
import { sendHrNotificationEmail } from "@/lib/notifications/resend-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const FAILURE = "Vérification impossible. Actualisez la demande ou contactez les RH.";
export function hashEmailChangeToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function isEmailChangeToken(token: unknown): token is string { return typeof token === "string" && /^[a-zA-Z0-9_-]{43}$/.test(token); }
function failure(error: { message?: string; code?: string } | null): Error {
  if (error?.message === "multi_employment_hr_arbitration") return new Error("Ce compte possède plusieurs emplois. Un arbitrage RH global est nécessaire ; aucune modification n’a été réalisée.");
  if (error?.message === "owner_required") return new Error("Le titulaire du compte doit ouvrir la page de changement d’email dans son espace salarié.");
  if (error?.code === "23505") return new Error("Cette adresse nécessite un arbitrage RH en raison d’un conflit d’identité.");
  if (error?.code === "PT429") return new Error("Attendez une minute avant de demander un autre email.");
  if (error?.message === "auth_outcome_unknown") return new Error("Le résultat de la précédente demande Auth est encore indéterminé. Ne relancez pas le changement : les RH doivent réconcilier l’identité après confirmation de la nouvelle adresse.");
  if (error?.message === "verification_pending") return new Error("La confirmation Auth est encore en attente. Confirmez les liens reçus aux adresses concernées puis réessayez.");
  return new Error(FAILURE);
}
async function ownerSession() {
  const client = await createClient(); const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Connectez-vous avec le compte salarié concerné.");
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("id,role,is_active").eq("auth_user_id", data.user.id).single();
  if (profileError || !profile?.is_active || profile.role !== "employee") throw new Error("Accès réservé au titulaire du compte salarié actif.");
  return { client, admin, user: data.user, profileId: profile.id as string };
}
export type OwnEmailChange = { id: string; requested_value: string; status: string };
export async function listOwnEmailChanges(): Promise<OwnEmailChange[]> {
  const { client, admin, profileId } = await ownerSession();
  // Session RLS filters suspended employments and inactive agencies.
  const { data: employees, error } = await client.from("employees").select("id").eq("profile_id", profileId);
  if (error) throw new Error(FAILURE); if (!employees?.length) return [];
  const { data, error: requestsError } = await admin.from("agency_employee_change_requests").select("id,requested_value,status").in("employee_id", employees.map(e => e.id)).eq("kind", "EMAIL").in("status", ["APPROVED_PENDING_VERIFICATION", "EXECUTED"]).order("created_at", { ascending: false }).limit(20);
  if (requestsError) throw new Error(FAILURE); return data ?? [];
}
export async function startOwnEmailChange(requestId: string): Promise<void> {
  if (!uuid.safeParse(requestId).success) throw new Error(FAILURE);
  const { client, admin, profileId } = await ownerSession();
  const { data, error } = await admin.rpc("begin_employee_email_change", { p_request_id: requestId, p_actor_id: profileId });
  if (error) throw failure(error); if (data?.completed) return;
  if (!data?.linked || typeof data.email !== "string") throw new Error(FAILURE);
  // updateUser uses the OWNER's Auth session, never admin email_confirm. Auth's
  // secure email change sends confirmations to both current and new addresses.
  const callback = new URL("/auth/email-change/callback", getPublicSupabaseConfig().appUrl);
  const { error: authError } = await client.auth.updateUser({ email: data.email }, { emailRedirectTo: callback.toString() });
  if (!authError || (typeof authError.status === "number" && authError.status >= 400 && authError.status < 500)) {
    // A known response proves this request no longer races RH cancellation.
    // A network timeout leaves the barrier for a safe owner retry/reconciliation.
    await admin.rpc("settle_employee_email_change", { p_actor_id: profileId, p_request_id: requestId, p_attempt_id: data.attemptId });
  }
  if (authError) {
    const knownFailure = typeof authError.status === "number" && authError.status >= 400 && authError.status < 500;
    throw new Error(knownFailure ? "L’envoi Auth a échoué. La demande reste en attente ; vous pouvez réessayer dans une minute." : "Le résultat Auth est indéterminé. Conservez les liens reçus et contactez les RH pour une réconciliation après vérification ; ne relancez pas le changement.");
  }
}
export async function finishOwnEmailChange(requestId: string): Promise<void> {
  if (!uuid.safeParse(requestId).success) throw new Error(FAILURE);
  const { admin, user } = await ownerSession();
  const { data, error } = await admin.rpc("complete_employee_email_change", { p_request_id: requestId, p_auth_user_id: user.id });
  if (error || data !== true) throw failure(error);
}
export async function requestUnlinkedEmailVerification(requestId: string): Promise<void> {
  if (!uuid.safeParse(requestId).success) throw new Error(FAILURE);
  const actor = await requireCanManageHrReferential(); const admin = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin.rpc("begin_employee_email_change", { p_request_id: requestId, p_actor_id: actor.id, p_token_hash: hashEmailChangeToken(token) });
  if (error) throw failure(error); if (data?.completed) return;
  if (data?.linked || typeof data.email !== "string") throw new Error("Le titulaire doit vérifier ce changement depuis /employee/email-change.");
  // Fragment keeps the bearer proof out of access logs and Referer headers.
  const link = new URL("/auth/email-change", getPublicSupabaseConfig().appUrl);
  link.hash = new URLSearchParams({ request: requestId, token }).toString();
  const safeLink = link.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  await sendHrNotificationEmail({ to: data.email, subject: "Confirmez votre nouvelle adresse MadajobPay", html: `<p>Le service RH a approuvé une correction de votre adresse de connexion. Confirmez uniquement si cette demande vous concerne.</p><p><a href="${safeLink}">Vérifier ma nouvelle adresse</a></p><p>Ce lien expire dans 30 minutes. La confirmation modifie uniquement l’adresse de votre emploi et ne crée ni ne rattache de compte. Une invitation distincte sera nécessaire pour activer votre accès.</p>`, idempotencyKey: `employee-email/${requestId}/${hashEmailChangeToken(token)}` });
}
export async function confirmUnlinkedEmailChange(requestId: string, token: string): Promise<void> {
  if (!uuid.safeParse(requestId).success || !isEmailChangeToken(token)) throw new Error(FAILURE);
  const { data, error } = await createAdminClient().rpc("complete_employee_email_change", { p_request_id: requestId, p_token_hash: hashEmailChangeToken(token) });
  if (error || data !== true) throw new Error("Lien invalide ou expiré. Demandez un nouvel envoi aux RH.");
}
/** RH recovery: reconcile verified Auth, or cancel only when Auth cannot later change. */
export async function reconcileEmailChange(requestId: string): Promise<"EXECUTED" | "CANCELLED"> {
  if (!uuid.safeParse(requestId).success) throw new Error(FAILURE);
  const actor = await requireCanManageHrReferential();
  const { data, error } = await createAdminClient().rpc("reconcile_employee_email_change", { p_actor_id: actor.id, p_request_id: requestId });
  if (error || (data !== "EXECUTED" && data !== "CANCELLED")) throw failure(error);
  return data;
}
