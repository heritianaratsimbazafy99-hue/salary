import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { InvitationCooldownError, upsertPendingEmployeeInvitation } from "@/lib/employees/linking";
import { EMAIL_DELIVERY_UNCONFIRMED, sendPayslipPublishedEmail, sendPayslipPublishedEmails } from "@/lib/notifications/resend-server";

type Client = Pick<SupabaseClient, "from">;
const RESEND_COOLDOWN_MS = 60_000;
export class InvitationImportNotFoundError extends Error {}
export class InvitationImportConflictError extends Error {}

export async function resendImportInvitations(input: {
  actor: AgencyScopedActor;
  importId: string;
  readSupabase: Client;
  createWriteSupabase: () => Client;
  sendEmail?: typeof sendPayslipPublishedEmail;
}) {
  // Authorization precedes privileged reads or writes.
  assertCanManagePayrollForAgency({
    role: input.actor.role,
    actorAgencyId: input.actor.agencyId,
    requestedAgencyId: input.actor.agencyId,
  });
  const { data: payrollImport, error: importError } = await input.readSupabase.from("payroll_imports")
    .select("agency_id,status").eq("id", input.importId).single();
  if (importError || !payrollImport) throw new InvitationImportNotFoundError();
  assertCanManagePayrollForAgency({
    role: input.actor.role,
    actorAgencyId: input.actor.agencyId,
    requestedAgencyId: payrollImport.agency_id,
  });
  if (!["PUBLISHED", "SUPERSEDED"].includes(payrollImport.status)) throw new InvitationImportConflictError();

  const admin = input.createWriteSupabase();
  const agencyId = input.actor.agencyId;
  const { data: agency, error: agencyError } = await admin.from("agencies")
    .select("is_active").eq("id", agencyId).single();
  if (agencyError || !agency?.is_active) throw new InvitationImportConflictError();

  const employeeIds = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data: rows, error } = await input.readSupabase.from("payroll_import_rows")
      .select("employee_id").eq("agency_id", agencyId).eq("import_id", input.importId)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Impossible de charger les salariés de l'import.");
    for (const row of rows ?? []) if (typeof row.employee_id === "string") employeeIds.add(row.employee_id);
    if (!rows || rows.length < 500) break;
  }

  const result = { agencyId, sent: 0, failed: 0, skipped: 0, unconfirmed: 0, rollbackFailed: 0 };
  type PreparedInvitation = { email: string; fullName: string; invitation: Awaited<ReturnType<typeof upsertPendingEmployeeInvitation>> };
  type Preparation = { prepared: PreparedInvitation } | { state: "failed" | "skipped" };
  async function prepare(employeeId: string): Promise<Preparation> {
    try {
      // Use the current employee identity, never addresses from an older import.
      const { data: employee, error } = await admin.from("employees")
        .select("employee_id,email,full_name,profile_id,is_active")
        .eq("agency_id", agencyId).eq("employee_id", employeeId).maybeSingle();
      if (error) return { state: "failed" };
      if (!employee || employee.profile_id || employee.is_active !== true) return { state: "skipped" };
      const { data: accepted, error: acceptedError } = await admin.from("employee_invitations")
        .select("id").eq("agency_id", agencyId).eq("employee_id", employeeId)
        .eq("status", "ACCEPTED").maybeSingle();
      if (acceptedError) return { state: "failed" };
      // A legacy accepted invitation with a deleted account requires review.
      if (accepted) return { state: "skipped" };
      if (typeof employee.email !== "string" || typeof employee.full_name !== "string") return { state: "failed" };
      const invitation = await upsertPendingEmployeeInvitation(admin, {
        identity: { agencyId, employeeId, email: employee.email, fullName: employee.full_name },
        invitedBy: input.actor.id,
        cooldownMs: RESEND_COOLDOWN_MS,
      });
      return { prepared: { email: employee.email, fullName: employee.full_name, invitation } };
    } catch (error) {
      return { state: error instanceof InvitationCooldownError ? "skipped" : "failed" };
    }
  }
  const prepared: PreparedInvitation[] = [];
  const ids = [...employeeIds];
  for (let offset = 0; offset < ids.length; offset += 8) {
    // Promise.all preserves source order even when requests finish out of order.
    const batch = await Promise.all(ids.slice(offset, offset + 8).map(prepare));
    for (const item of batch) {
      if ("prepared" in item) prepared.push(item.prepared);
      else result[item.state] += 1;
    }
  }
  const messages = prepared.map(({ email, fullName, invitation }) => ({ to: email, employeeName: fullName, invitationToken: invitation.token }));
  const responses = input.sendEmail
    ? await Promise.all(messages.map(async (message) => {
      try { return await input.sendEmail!(message); }
      catch { return { data: null, error: { message: "Email delivery failed." } }; }
    }))
    : await sendPayslipPublishedEmails(messages);
  for (let index = 0; index < prepared.length; index += 1) {
    const { email, invitation } = prepared[index];
    const response = responses[index];
    if (response?.data?.id && !response.error) { result.sent += 1; continue; }
    if (response?.error && "code" in response.error && response.error.code === EMAIL_DELIVERY_UNCONFIRMED) {
      // The new link may already be in the recipient's inbox. Keep it valid until
      // provider-log review; restoring an older token would invalidate it.
      result.unconfirmed += 1;
      continue;
    }
    result.failed += 1;
    const previous = invitation.rollback.previousInvitation;
    if (previous?.email === email) {
      try {
        const { error } = await admin.from("employee_invitations")
          .update({ token_hash: previous.token_hash, expires_at: previous.expires_at })
          .eq("id", invitation.invitationId).eq("status", "PENDING")
          .eq("token_hash", invitation.rollback.tokenHash);
        if (error) result.rollbackFailed += 1;
      } catch { result.rollbackFailed += 1; }
    }
  }
  return result;
}
