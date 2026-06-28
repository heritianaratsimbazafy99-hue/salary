import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import {
  ensureEmployeeAuthProfile,
  rollbackEmployeeAuthProfileProvisioning,
  type ProvisionedEmployeeAuthProfile,
} from "@/lib/employees/linking";
import { sendPayslipPublishedEmail } from "@/lib/notifications/resend-server";

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

  const employeeIdentities = await loadPayrollImportEmployeeIdentities(input.readSupabase, {
    agencyId: payrollImport.agencyId,
    importId: input.importId,
  });
  const writeSupabase = input.createWriteSupabase();
  const provisionedEmployees: ProvisionedEmployeeAuthProfile[] = [];

  try {
    for (const employee of employeeIdentities) {
      provisionedEmployees.push(
        await ensureEmployeeAuthProfile(
          {
            agencyId: payrollImport.agencyId,
            email: employee.email,
            employeeId: employee.employeeId,
            fullName: employee.fullName,
            invitedByProfileId: input.actor.id,
          },
          writeSupabase,
        ),
      );
    }
  } catch (error) {
    await rollbackProvisionedEmployees(writeSupabase, provisionedEmployees);
    throw error;
  }

  const { data, error } = await writeSupabase.rpc("publish_payroll_import", {
    p_actor_agency_id: payrollImport.agencyId,
    p_actor_profile_id: input.actor.id,
    p_import_id: input.importId,
  });

  if (error) {
    await rollbackProvisionedEmployees(writeSupabase, provisionedEmployees);
    throw new Error("Impossible de publier l'import.");
  }

  const result = parsePublishRpcRecord(data);
  const emailResult = await sendPayslipPublishedNotifications({
    agencyId: result.agencyId,
    employeeIdentities,
    importId: input.importId,
    sendPayslipEmail: input.sendPayslipEmail ?? sendPayslipPublishedEmail,
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
  employeeIdentities: Array<{ email: string; employeeId: string; fullName: string }>;
  importId: string;
  sendPayslipEmail: typeof sendPayslipPublishedEmail;
  supabase: SupabasePublishClient;
}) {
  const notifications = await loadPublishedPayslipNotifications(input.supabase, {
    agencyId: input.agencyId,
    importId: input.importId,
  });
  const employeeNamesByEmail = new Map(
    input.employeeIdentities.map((employee) => [employee.email.toLowerCase(), employee.fullName]),
  );
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    const employeeName = employeeNamesByEmail.get(notification.recipientEmail) ?? "Salarie";

    try {
      const response = await input.sendPayslipEmail({
        employeeName,
        to: notification.recipientEmail,
      });
      const providerMessageId = parseProviderMessageId(response);

      await markNotificationSent(input.supabase, {
        notificationId: notification.id,
        providerMessageId,
      });
      sent += 1;
    } catch (error) {
      await markNotificationFailed(input.supabase, {
        failureReason: safeFailureReason(error),
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

async function loadPublishedPayslipNotifications(
  supabase: SupabasePublishClient,
  input: { agencyId: string; importId: string },
) {
  const { data: versions, error: versionsError } = await supabase
    .from("payslip_versions")
    .select("payslip_id")
    .eq("agency_id", input.agencyId)
    .eq("import_id", input.importId);

  if (versionsError) {
    throw new Error("Impossible de charger les bulletins publies pour notification.");
  }

  const payslipIds = ((versions ?? []) as PayslipVersionRecord[]).flatMap((version) =>
    typeof version.payslip_id === "string" ? [version.payslip_id] : [],
  );

  if (payslipIds.length === 0) return [];

  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id,recipient_email,resource_id")
    .eq("notification_type", "PAYSLIP_PUBLISHED")
    .eq("resource_type", "payslip")
    .eq("status", "PENDING")
    .in("resource_id", payslipIds);

  if (notificationsError) {
    throw new Error("Impossible de charger les notifications a envoyer.");
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
      },
    ];
  });
}

async function markNotificationSent(
  supabase: SupabasePublishClient,
  input: { notificationId: string; providerMessageId: string | null },
) {
  await supabase
    .from("notifications")
    .update({
      failed_at: null,
      failure_reason: null,
      provider_message_id: input.providerMessageId,
      sent_at: new Date().toISOString(),
      status: "SENT",
    })
    .eq("id", input.notificationId);
}

async function markNotificationFailed(
  supabase: SupabasePublishClient,
  input: { failureReason: string; notificationId: string },
) {
  await supabase
    .from("notifications")
    .update({
      failed_at: new Date().toISOString(),
      failure_reason: input.failureReason,
      status: "FAILED",
    })
    .eq("id", input.notificationId);
}

function parseProviderMessageId(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "data" in response &&
    response.data &&
    typeof response.data === "object" &&
    "id" in response.data &&
    typeof response.data.id === "string"
  ) {
    return response.data.id;
  }

  return null;
}

function safeFailureReason(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Email delivery failed.";
}

async function rollbackProvisionedEmployees(
  admin: SupabasePublishClient,
  provisionedEmployees: ProvisionedEmployeeAuthProfile[],
) {
  await Promise.allSettled(
    provisionedEmployees.map((employee) =>
      rollbackEmployeeAuthProfileProvisioning(admin, employee),
    ),
  );
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
  const { data, error } = await supabase
    .from("payroll_import_rows")
    .select("employee_id,employee_email,employee_name")
    .eq("import_id", input.importId)
    .eq("agency_id", input.agencyId);

  if (error) {
    throw new Error("Impossible de charger les salaries de l'import.");
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
