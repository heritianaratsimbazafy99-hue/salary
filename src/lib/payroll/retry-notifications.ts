import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { EMAIL_DELIVERY_UNCONFIRMED, EmailDeliveryError, sendPayslipPublishedEmail } from "@/lib/notifications/resend-server";
import { loadPublishedPayslipNotifications, markNotificationFailed, markNotificationSent, PublishConflictError, PublishNotFoundError } from "@/lib/payroll/publish";

/** Retry only definite failures for active accounts; invitation recovery has its own action. */
export async function retryImportNotifications(input: {
  actor: AgencyScopedActor;
  importId: string;
  readSupabase: Pick<SupabaseClient, "from">;
  createWriteSupabase: () => SupabaseClient;
}) {
  assertCanManagePayrollForAgency({ role: input.actor.role, actorAgencyId: input.actor.agencyId, requestedAgencyId: input.actor.agencyId });
  const { data: payrollImport, error } = await input.readSupabase.from("payroll_imports")
    .select("agency_id,status").eq("id", input.importId).single();
  if (error || !payrollImport) throw new PublishNotFoundError();
  assertCanManagePayrollForAgency({ role: input.actor.role, actorAgencyId: input.actor.agencyId, requestedAgencyId: payrollImport.agency_id });
  if (!["PUBLISHED", "SUPERSEDED"].includes(payrollImport.status)) throw new PublishConflictError(payrollImport.status);
  const admin = input.createWriteSupabase();
  const { data: agency, error: agencyError } = await admin.from("agencies").select("is_active").eq("id", input.actor.agencyId).single();
  if (agencyError || !agency?.is_active) throw new PublishConflictError("INACTIVE_AGENCY");
  const notifications = await loadPublishedPayslipNotifications(admin, { agencyId: input.actor.agencyId, importId: input.importId, includeFailed: true });
  const result = { agencyId: input.actor.agencyId, sent: 0, failed: 0, skipped: 0, remaining: 0, unconfirmed: 0 };
  let attempted = 0;
  const deadline = Date.now() + 120_000;
  for (const notification of notifications) {
    // Reissuing an uncertain batch with a different request key could duplicate a
    // delivered email. Require provider-log review instead of assuming failure.
    if (notification.deliveryUnconfirmed || notification.pending) { result.unconfirmed += 1; continue; }
    if (attempted >= 20 || Date.now() >= deadline) { result.remaining += 1; continue; }
    const { data: payslip, error: payslipError } = await admin.from("payslips").select("employee_id")
      .eq("id", notification.resourceId).eq("agency_id", input.actor.agencyId).maybeSingle();
    if (payslipError) { result.failed += 1; continue; }
    if (!payslip) { result.skipped += 1; continue; }
    const { data: employee, error: employeeError } = await admin.from("employees").select("email,full_name,is_active,profile_id")
      .eq("agency_id", input.actor.agencyId).eq("id", payslip.employee_id).maybeSingle();
    if (employeeError) { result.failed += 1; continue; }
    if (!employee?.is_active || !employee.profile_id || employee.email !== notification.recipientEmail) { result.skipped += 1; continue; }
    const { data: profile, error: profileError } = await admin.from("profiles").select("is_active,role")
      .eq("id", employee.profile_id).maybeSingle();
    if (profileError) { result.failed += 1; continue; }
    if (!profile?.is_active || profile.role !== "employee") { result.skipped += 1; continue; }
    attempted += 1;
    let providerAccepted = false;
    try {
      const delivery = await sendPayslipPublishedEmail({ to: employee.email, employeeName: employee.full_name, idempotencyKey: `notification-retry/${notification.id}` });
      if (delivery.error || !delivery.data?.id) throw new EmailDeliveryError(true);
      providerAccepted = true;
      await markNotificationSent(admin, { notificationId: notification.id, providerMessageId: delivery.data.id });
      result.sent += 1;
    } catch (error) {
      const ambiguous = providerAccepted || (error instanceof EmailDeliveryError && error.deliveryUnconfirmed);
      await markNotificationFailed(admin, { notificationId: notification.id, failureReason: ambiguous ? EMAIL_DELIVERY_UNCONFIRMED : "Email delivery failed." });
      if (ambiguous) result.unconfirmed += 1;
      else result.failed += 1;
      if (ambiguous || (error instanceof EmailDeliveryError && error.quotaExceeded)) {
        result.remaining = notifications.length - result.sent - result.failed - result.skipped - result.unconfirmed;
        break;
      }
    }
  }
  return result;
}
