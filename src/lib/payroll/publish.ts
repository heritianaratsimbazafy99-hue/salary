import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import {
  ensureEmployeeAuthProfile,
  type ProvisionedEmployeeAuthProfile,
} from "@/lib/employees/linking";
import { EMAIL_DELIVERY_UNCONFIRMED, sendPayslipPublishedEmail, sendPayslipPublishedEmails, type EmailDeliveryResult } from "@/lib/notifications/resend-server";

type SupabaseReadClient = Pick<SupabaseClient, "from">;
type SupabasePublishClient = Pick<SupabaseClient, "auth" | "from" | "rpc">;

type PayrollImportRecord = {
  agency_id?: unknown;
  id?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  status?: unknown;
};

type PayrollImportEmployeeRecord = {
  employee_email?: unknown;
  employee_id?: unknown;
  employee_name?: unknown;
};

type PayslipVersionRecord = {
  payslip_id?: unknown;
};

type NotificationRecord = {
  id?: unknown;
  recipient_email?: unknown;
  resource_id?: unknown;
  failure_reason?: unknown;
  status?: unknown;
};

type PublishRpcRecord = {
  agency_id?: unknown;
  import_id?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  published_count?: unknown;
  status?: unknown;
};

export type PublishImportResult = {
  agencyId: string;
  emailFailedCount: number;
  emailSentCount: number;
  importId: string;
  notificationCount: number;
  periodEnd: string;
  periodStart: string;
  publishedCount: number;
  status: "PUBLISHED";
};

type PublishRpcResult = Omit<PublishImportResult, "emailFailedCount" | "emailSentCount" | "notificationCount">;

export class PublishNotFoundError extends Error {}
export class PublishConflictError extends Error {
  constructor(readonly status: string) {
    super("Import cannot be published from its current status.");
  }
}

export function nextVersionNumber(existingVersions: number[]) {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export async function publishPayrollImport(input: {
  actor: AgencyScopedActor;
  createWriteSupabase: () => SupabasePublishClient;
  importId: string;
  readSupabase: SupabaseReadClient;
  fingerprint: string;
  sendPayslipEmail?: typeof sendPayslipPublishedEmail;
}): Promise<PublishImportResult> {
  const payrollImport = await loadPayrollImport(input.readSupabase, input.importId);

  assertCanManagePayrollForAgency({
    actorAgencyId: input.actor.agencyId,
    requestedAgencyId: payrollImport.agencyId,
    role: input.actor.role,
  });

  if (payrollImport.status !== "READY_FOR_PREVIEW") {
    throw new PublishConflictError(payrollImport.status);
  }

  const writeSupabase = input.createWriteSupabase();
  const provisionedEmployees: ProvisionedEmployeeAuthProfile[] = [];

  // Commit the reviewed snapshot before creating invitations or sending messages.
  const { data, error } = await writeSupabase.rpc("publish_payroll_import_reviewed", {
    p_actor_agency_id: payrollImport.agencyId,
    p_actor_profile_id: input.actor.id,
    p_import_id: input.importId,
    p_fingerprint: input.fingerprint,
  });
  if (error) {
    if (error.code === "40001" || error.code === "PT409" || error.code === "P0001") throw new PublishConflictError("STALE_REVIEW");
    throw new Error("Impossible de publier l'import.");
  }
  const result = parsePublishRpcRecord(data);
  // Published rows are immutable. Read them only after the reviewed transaction
  // commits so a concurrent correction cannot leave provisioning on an older state.
  const employeeIdentities = await loadPayrollImportEmployeeIdentities(writeSupabase, {
    agencyId: result.agencyId,
    importId: input.importId,
  });
  // Bound cross-region database work without opening hundreds of connections.
  for (let start = 0; start < employeeIdentities.length; start += 8) {
    const batch = await Promise.all(employeeIdentities.slice(start, start + 8).map(async (employee) => {
      try {
        return await ensureEmployeeAuthProfile({
          agencyId: payrollImport.agencyId, email: employee.email,
          employeeId: employee.employeeId, fullName: employee.fullName,
          invitedByProfileId: input.actor.id,
        }, writeSupabase);
      } catch { return null; }
    }));
    provisionedEmployees.push(...batch.filter((employee): employee is ProvisionedEmployeeAuthProfile => employee !== null));
  }
  const emailResult = await sendPayslipPublishedNotifications({
    agencyId: result.agencyId,
    provisionedEmployees,
    importId: input.importId,
    sendPayslipEmail: input.sendPayslipEmail,
    supabase: writeSupabase,
  });

  return {
    agencyId: result.agencyId,
    emailFailedCount: emailResult.failed,
    emailSentCount: emailResult.sent,
    importId: result.importId,
    notificationCount: emailResult.total,
    periodEnd: result.periodEnd,
    periodStart: result.periodStart,
    publishedCount: result.publishedCount,
    status: "PUBLISHED",
  };
}

async function sendPayslipPublishedNotifications(input: {
  agencyId: string;
  provisionedEmployees: ProvisionedEmployeeAuthProfile[];
  importId: string;
  sendPayslipEmail?: typeof sendPayslipPublishedEmail;
  supabase: SupabasePublishClient;
}) {
  const notifications = await loadPublishedPayslipNotifications(input.supabase, {
    agencyId: input.agencyId,
    importId: input.importId,
  });
  const employeesByEmail = new Map(
    input.provisionedEmployees.map((employee) => [employee.email.toLowerCase(), employee]),
  );
  let sent = 0;
  let failed = 0;

  const deliverable = notifications.flatMap((notification) => {
    const employee = employeesByEmail.get(notification.recipientEmail.toLowerCase());
    return employee ? [{ notification, employee }] : [];
  });
  const messages = deliverable.map(({ notification, employee }) => ({
    employeeName: employee.fullName,
    ...(employee.invitationToken ? { invitationToken: employee.invitationToken } : {}),
    to: notification.recipientEmail,
    idempotencyKey: `notification/${notification.id}`,
  }));
  const results: EmailDeliveryResult[] = input.sendPayslipEmail
    ? await Promise.all(messages.map(async (message) => {
      try { return await input.sendPayslipEmail!(message); }
      catch { return { data: null, error: { message: "Email delivery failed." } }; }
    }))
    : await sendPayslipPublishedEmails(messages);
  const deliveredById = new Map(deliverable.map(({ notification }, index) => [notification.id, results[index]]));
  for (const notification of notifications) {
    const delivery = deliveredById.get(notification.id);
    if (delivery?.data?.id && !delivery.error) {
      try {
        await markNotificationSent(input.supabase, { notificationId: notification.id, providerMessageId: delivery.data.id });
        sent += 1;
      } catch {
        await markNotificationFailed(input.supabase, { notificationId: notification.id, failureReason: EMAIL_DELIVERY_UNCONFIRMED });
        failed += 1;
      }
    } else {
      await markNotificationFailed(input.supabase, {
        failureReason: delivery?.error?.code === EMAIL_DELIVERY_UNCONFIRMED
          ? EMAIL_DELIVERY_UNCONFIRMED : employeesByEmail.get(notification.recipientEmail.toLowerCase())?.invitationToken ? "Invitation email delivery failed." : "Email delivery failed.",
        notificationId: notification.id,
      });
      failed += 1;
    }
  }

  return {
    failed,
    sent,
    total: notifications.length,
  };
}

export async function loadPublishedPayslipNotifications(
  supabase: SupabasePublishClient,
  input: { agencyId: string; importId: string; includeFailed?: boolean },
) {
  const payslipIds: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: versions, error } = await supabase.from("payslip_versions")
      .select("payslip_id").eq("agency_id", input.agencyId).eq("import_id", input.importId)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Impossible de charger les bulletins publiés pour notification.");
    payslipIds.push(...((versions ?? []) as PayslipVersionRecord[]).flatMap((version) =>
      typeof version.payslip_id === "string" ? [version.payslip_id] : [],
    ));
    if (!versions || versions.length < 500) break;
  }

  const notifications: NotificationRecord[] = [];
  // Keep IN filters bounded as well as result pages: a large import otherwise
  // exceeds URL limits even when the database result is paginated.
  const uniquePayslipIds = [...new Set(payslipIds)];
  for (let start = 0; start < uniquePayslipIds.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data: batch, error } = await supabase.from("notifications")
        .select("id,recipient_email,resource_id,failure_reason,status")
        .eq("notification_type", "PAYSLIP_PUBLISHED").eq("resource_type", "payslip")
        .in("status", input.includeFailed ? ["PENDING", "FAILED"] : ["PENDING"]).in("resource_id", uniquePayslipIds.slice(start, start + 100))
        .order("id").range(offset, offset + 499);
      if (error) throw new Error("Impossible de charger les notifications à envoyer.");
      notifications.push(...(batch ?? []));
      if (!batch || batch.length < 500) break;
    }
  }

  return ((notifications ?? []) as NotificationRecord[]).flatMap((notification) => {
    if (
      typeof notification.id !== "string" ||
      typeof notification.recipient_email !== "string" ||
      typeof notification.resource_id !== "string"
    ) {
      return [];
    }

    return [
      {
        id: notification.id,
        recipientEmail: notification.recipient_email,
        resourceId: notification.resource_id,
        deliveryUnconfirmed: notification.failure_reason === EMAIL_DELIVERY_UNCONFIRMED,
        pending: notification.status === "PENDING",
      },
    ];
  });
}

export async function markNotificationSent(
  supabase: SupabasePublishClient,
  input: { notificationId: string; providerMessageId: string | null },
) {
  const { error } = await supabase
    .from("notifications")
    .update({
      failed_at: null,
      failure_reason: null,
      provider_message_id: input.providerMessageId,
      sent_at: new Date().toISOString(),
      status: "SENT",
    })
    .eq("id", input.notificationId);
  if (error) throw new Error("Impossible de journaliser le résultat email.");
}

export async function markNotificationFailed(
  supabase: SupabasePublishClient,
  input: { failureReason: string; notificationId: string },
) {
  const { error } = await supabase
    .from("notifications")
    .update({
      failed_at: new Date().toISOString(),
      failure_reason: input.failureReason,
      status: "FAILED",
    })
    .eq("id", input.notificationId);
  if (error) throw new Error("Impossible de journaliser le résultat email.");
}

async function loadPayrollImport(supabase: SupabaseReadClient, importId: string) {
  const { data, error } = await supabase
    .from("payroll_imports")
    .select("id,agency_id,period_start,period_end,status")
    .eq("id", importId)
    .single();

  const payrollImport = data as PayrollImportRecord | null;
  if (error || !payrollImport) {
    throw new PublishNotFoundError("Import introuvable.");
  }

  if (
    typeof payrollImport.agency_id !== "string" ||
    typeof payrollImport.period_start !== "string" ||
    typeof payrollImport.period_end !== "string" ||
    typeof payrollImport.status !== "string"
  ) {
    throw new Error("Import invalide.");
  }

  return {
    agencyId: payrollImport.agency_id,
    periodEnd: payrollImport.period_end,
    periodStart: payrollImport.period_start,
    status: payrollImport.status,
  };
}

async function loadPayrollImportEmployeeIdentities(
  supabase: SupabaseReadClient,
  input: { agencyId: string; importId: string },
) {
  const data: PayrollImportEmployeeRecord[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: rows, error } = await supabase.from("payroll_import_rows")
      .select("employee_id,employee_email,employee_name")
      .eq("import_id", input.importId).eq("agency_id", input.agencyId)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Impossible de charger les salariés de l'import.");
    data.push(...(rows ?? []));
    if (!rows || rows.length < 500) break;
  }

  return ((data ?? []) as PayrollImportEmployeeRecord[]).flatMap((row) => {
    if (
      typeof row.employee_id !== "string" ||
      typeof row.employee_email !== "string" ||
      typeof row.employee_name !== "string"
    ) {
      return [];
    }

    return [
      {
        email: row.employee_email,
        employeeId: row.employee_id,
        fullName: row.employee_name,
      },
    ];
  });
}

function parsePublishRpcRecord(data: unknown): PublishRpcResult {
  const record = (Array.isArray(data) ? data[0] : data) as PublishRpcRecord | null;

  if (
    !record ||
    typeof record.agency_id !== "string" ||
    typeof record.import_id !== "string" ||
    typeof record.period_end !== "string" ||
    typeof record.period_start !== "string" ||
    typeof record.published_count !== "number" ||
    record.status !== "PUBLISHED"
  ) {
    throw new Error("Resultat de publication invalide.");
  }

  return {
    agencyId: record.agency_id,
    importId: record.import_id,
    periodEnd: record.period_end,
    periodStart: record.period_start,
    publishedCount: record.published_count,
    status: "PUBLISHED",
  };
}
