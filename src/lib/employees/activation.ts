import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { requireSupabaseServiceRoleKey } from "@/lib/env.server";
import { sendEmployeeActivationEmail } from "@/lib/notifications/resend-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const INVITATION_CONTEXT_COOKIE = "madajobpay-invitation";
export const INVITATION_CONTEXT_MAX_AGE = 15 * 60;

export type InvitationAvailability = "pending" | "expired" | "unavailable";
export type ActivationResult = "sent" | "expired" | "unavailable" | "email_mismatch" | "send_failed" | "rate_limited";

type AdminClient = ReturnType<typeof createAdminClient>;
type InvitationContext = { invitationHash: string; authTokenHash: string; expiresAt: number };

export function createInvitationContext(invitationToken: string, authToken: string): string {
  const payload = Buffer.from(JSON.stringify({
    invitationHash: hashInvitationToken(invitationToken),
    authTokenHash: hashInvitationToken(authToken),
    expiresAt: Date.now() + INVITATION_CONTEXT_MAX_AGE * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", requireSupabaseServiceRoleKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readInvitationContext(value: string, authToken: string): InvitationContext | null {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || value.length > 1024 || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256", requireSupabaseServiceRoleKey()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as InvitationContext;
    if (!/^[a-f0-9]{64}$/.test(context.invitationHash) || !/^[a-f0-9]{64}$/.test(context.authTokenHash)) return null;
    if (typeof context.expiresAt !== "number" || context.expiresAt <= Date.now()) return null;
    if (!timingSafeEqual(Buffer.from(context.authTokenHash), Buffer.from(hashInvitationToken(authToken)))) return null;
    return context;
  } catch {
    return null;
  }
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isInvitationToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-zA-Z0-9_-]{32,256}$/.test(token);
}

async function findInvitation(token: string, admin: AdminClient) {
  if (!isInvitationToken(token)) return null;

  const { data, error } = await admin
    .from("employee_invitations")
    .select("email,status,expires_at")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (error) throw new Error("Invitation lookup failed");
  if (!data || typeof data.email !== "string" || typeof data.expires_at !== "string") return null;
  return data as { email: string; status: string; expires_at: string };
}

function availability(invitation: Awaited<ReturnType<typeof findInvitation>>): InvitationAvailability {
  if (!invitation || !["PENDING", "EXPIRED"].includes(invitation.status)) return "unavailable";
  const expires = Date.parse(invitation.expires_at);
  if (invitation.status === "EXPIRED" || !Number.isFinite(expires) || expires <= Date.now()) return "expired";
  return "pending";
}

export async function getInvitationAvailability(token: string, admin = createAdminClient()) {
  return availability(await findInvitation(token, admin));
}

// A token never confirms an email. The separate Auth email proof does, bound to this browser.
export async function requestEmployeeActivation(
  input: { token: string; email: string; appUrl: string },
  admin: AdminClient,
): Promise<{ status: ActivationResult; context?: string }> {
  const invitation = await findInvitation(input.token, admin);
  const state = availability(invitation);
  if (state !== "pending" || !invitation) return { status: state === "expired" ? "expired" : "unavailable" };
  const email = input.email.trim().toLowerCase();
  if (email !== invitation.email.trim().toLowerCase()) return { status: "email_mismatch" };

  const now = new Date();
  const { data: claim, error: claimError } = await admin
    .from("employee_invitations")
    .update({ activation_requested_at: now.toISOString() })
    .eq("token_hash", hashInvitationToken(input.token))
    .eq("status", "PENDING")
    .gt("expires_at", now.toISOString())
    .or(`activation_requested_at.is.null,activation_requested_at.lt.${new Date(now.getTime() - 60_000).toISOString()}`)
    .select("id")
    .maybeSingle();
  if (claimError) return { status: "send_failed" };
  if (!claim) return { status: "rate_limited" };

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const authToken = data?.properties?.hashed_token;
  if (error || !authToken) return { status: "send_failed" };
  const confirmationUrl = new URL("/auth/callback", input.appUrl);
  confirmationUrl.searchParams.set("token_hash", authToken);
  const context = createInvitationContext(input.token, authToken);
  await sendEmployeeActivationEmail({ to: email, confirmationUrl: confirmationUrl.toString() });
  return { status: "sent", context };
}

export async function acceptVerifiedEmployeeInvitation(authUserId: string, tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  const { data, error } = await createAdminClient().rpc("accept_employee_invitation", {
    p_auth_user_id: authUserId,
    p_token_hash: tokenHash,
  });
  const record = Array.isArray(data) ? data[0] : data;
  return !error && record?.status === "ACCEPTED" && typeof record.employee_id === "string";
}
