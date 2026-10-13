import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { InvitationCooldownError, upsertPendingEmployeeInvitation } from "@/lib/employees/linking";
import { sendPayslipPublishedEmail } from "@/lib/notifications/resend-server";

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

  const result = { agencyId, sent: 0, failed: 0, skipped: 0 };
  for (const employeeId of employeeIds) {
    // Use the current employee identity, never stale addresses from an older import.
    const { data: employee, error } = await admin.from("employees")
      .select("employee_id,email,full_name,profile_id,is_active")
      .eq("agency_id", agencyId).eq("employee_id", employeeId).maybeSingle();
    if (error) { result.failed += 1; continue; }
    if (!employee || employee.profile_id || employee.is_active !== true) { result.skipped += 1; continue; }
    const { data: accepted, error: acceptedError } = await admin.from("employee_invitations")
      .select("id").eq("agency_id", agencyId).eq("employee_id", employeeId)
      .eq("status", "ACCEPTED").maybeSingle();
    if (acceptedError) { result.failed += 1; continue; }
    // A legacy accepted invitation with a deleted account requires explicit review.
    if (accepted) { result.skipped += 1; continue; }
    if (typeof employee.email !== "string" || typeof employee.full_name !== "string") {
      result.failed += 1;
      continue;
    }

    let invitation: Awaited<ReturnType<typeof upsertPendingEmployeeInvitation>> | null = null;
    try {
      invitation = await upsertPendingEmployeeInvitation(admin, {
        identity: { agencyId, employeeId, email: employee.email, fullName: employee.full_name },
        invitedBy: input.actor.id,
        cooldownMs: RESEND_COOLDOWN_MS,
      });
      const response = await (input.sendEmail ?? sendPayslipPublishedEmail)({
        to: employee.email,
        employeeName: employee.full_name,
        invitationToken: invitation.token,
      });
      if (response?.error) throw new Error("Email refusé.");
      result.sent += 1;
    } catch (error) {
      if (error instanceof InvitationCooldownError) {
        result.skipped += 1;
      } else {
        const previous = invitation?.rollback.previousInvitation;
        if (invitation && previous?.email === employee.email) {
          // Keep the last delivered link usable on delivery failure. Preserve the
          // current updated_at so repeated failures cannot bypass the send limit.
          try {
            await admin.from("employee_invitations")
              .update({ token_hash: previous.token_hash, expires_at: previous.expires_at })
              .eq("id", invitation.invitationId).eq("status", "PENDING")
              .eq("token_hash", invitation.rollback.tokenHash);
          } catch {
            // The result still reports failure; a manager can retry after cooldown.
          }
        }
        result.failed += 1;
      }
    }
  }
  return result;
}
