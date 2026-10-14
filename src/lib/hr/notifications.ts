import "server-only";
import { publicEnv } from "../env.public";
import { buildContractAlertEmail, buildMonthlyReportEmail, type ContractAlertItem } from "../notifications/resend";
import { sendHrNotificationEmail } from "../notifications/resend-server";
import { toCsv } from "../payroll/csv";
import { createAdminClient } from "../supabase/admin";
import { CONTRACT_TYPE_LABEL, type HrContractType } from "./labels";
import { absenteeismRate, coverageRate, type Dashboard } from "./reporting";

const DEFAULT_APP_URL = "http://localhost:3000";
type Outcome = { recipients: number; sent: number; skipped: number; failed: number };
type DueAlert = {
  recipient_profile_id: string; recipient_email: string; recipient_name: string; agency_name: string; matricule: string; full_name: string;
  site_name: string; contract_type: HrContractType; contract_end: string; threshold: number; dedupe_key: string;
};

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Daily contract alerts (J-30, J-15, J-7). One digest per recipient; each
 * (recipient, contract end, threshold) is logged once, so a rerun the same day
 * or the next days does not repeat it. The provider idempotency key also
 * absorbs a rerun between a successful send and its delivery log.
 */
export async function runContractAlerts(today: string): Promise<Outcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("hr_contract_alerts_due", { p_today: today });
  if (error) throw new Error("Unable to compute contract alerts.");
  const byRecipient = new Map<string, DueAlert[]>();
  for (const alert of (data ?? []) as DueAlert[]) byRecipient.set(alert.recipient_profile_id, [...(byRecipient.get(alert.recipient_profile_id) ?? []), alert]);
  const outcome: Outcome = { recipients: byRecipient.size, sent: 0, skipped: 0, failed: 0 };
  for (const [recipientId, alerts] of byRecipient) {
    const items: ContractAlertItem[] = alerts.map((a) => ({ fullName: a.full_name, matricule: a.matricule, siteName: a.site_name, agencyName: a.agency_name,
      contractType: CONTRACT_TYPE_LABEL[a.contract_type], contractEnd: a.contract_end, daysLeft: daysBetween(today, a.contract_end) }));
    try {
      const response = await sendHrNotificationEmail({
        to: alerts[0].recipient_email, idempotencyKey: `alerts:${recipientId}:${today}:${alerts.map((a) => a.dedupe_key).join("|")}`,
        ...buildContractAlertEmail({ recipientName: alerts[0].recipient_name, appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL, items }),
      });
      const { error: logError } = await admin.from("hr_notification_deliveries").upsert(
        alerts.map((a) => ({ kind: "CONTRACT_ALERTS", dedupe_key: a.dedupe_key, recipient_profile_id: recipientId, provider_message_id: response.data?.id ?? null })),
        { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (logError) throw new Error("delivery log failed");
      outcome.sent += 1;
    } catch {
      outcome.failed += 1;
    }
  }
  return outcome;
}

function previousMonth(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return start.toISOString().slice(0, 10);
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 1000) / 10} %`;
}

export function monthlySummary(dashboard: Dashboard) {
  const t = dashboard.totals;
  const summary = [
    { label: "Effectif actif", value: String(t.headcount) },
    { label: "Taux de couverture (affectation active)", value: percent(coverageRate(t.headcount, t.assigned)) },
    { label: "Entrées / sorties du mois", value: `${t.entries} / ${t.exits}` },
    { label: "Remplacements confirmés / à pourvoir", value: `${t.confirmed_replacements} / ${t.open_replacements}` },
    { label: "Contrats à échéance sous 30 jours", value: String(t.contracts_ending_30) },
  ];
  // Absence figures are leave data: absent for client viewers (null from the database).
  if (t.absence_days !== null) summary.splice(3, 0, { label: "Taux d’absentéisme", value: percent(absenteeismRate(t.absence_days, t.headcount, dashboard.period.business_days)) });
  const csv = toCsv(
    ["Site", "Effectif actif", "Affectés", "Couverture", ...(t.absence_days !== null ? ["Jours d’absence"] : []), "Remplacements à pourvoir", "Remplacements confirmés", "Contrats < 30 j"],
    dashboard.sites.map((s) => [s.site_name, s.headcount, s.assigned, percent(coverageRate(s.headcount, s.assigned)), ...(t.absence_days !== null ? [s.absence_days ?? 0] : []),
      s.open_replacements, s.confirmed_replacements, s.contracts_ending_30]),
  );
  return { summary, csv };
}

type Subscription = { profile_id: string; agency_id: string; profile: { email: string; full_name: string; role: string; is_active: boolean } | null; agency: { name: string; is_active: boolean } | null };

/** Monthly report of the previous month, computed in each recipient's own scope. */
export async function runMonthlyReports(today: string): Promise<Outcome> {
  const admin = createAdminClient();
  const monthStart = previousMonth(today);
  const month = monthStart.slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T00:00:00Z`));
  const { data, error } = await admin.from("hr_report_subscriptions")
    .select("profile_id,agency_id,profile:profiles!hr_report_subscriptions_profile_id_fkey(email,full_name,role,is_active),agency:agencies(name,is_active)")
    .eq("kind", "MONTHLY_REPORT");
  if (error) throw new Error("Unable to load report subscriptions.");
  const subscriptions = ((data ?? []) as unknown as Subscription[]).map((row) => ({
    ...row, profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile, agency: Array.isArray(row.agency) ? row.agency[0] ?? null : row.agency,
  }));
  const outcome: Outcome = { recipients: subscriptions.length, sent: 0, skipped: 0, failed: 0 };
  for (const subscription of subscriptions) {
    const dedupeKey = `monthly:${subscription.profile_id}:${subscription.agency_id}:${month}`;
    if (!subscription.profile?.is_active || !subscription.agency?.is_active) { outcome.skipped += 1; continue; }
    const { data: delivered } = await admin.from("hr_notification_deliveries").select("id").eq("dedupe_key", dedupeKey).maybeSingle();
    if (delivered) { outcome.skipped += 1; continue; }
    try {
      const { data: dashboard, error: dashboardError } = await admin.rpc("hr_dashboard_for_profile", {
        p_profile_id: subscription.profile_id, p_agency_id: subscription.agency_id, p_month: monthStart, p_today: today,
      });
      if (dashboardError) throw new Error("dashboard failed");
      if (!dashboard) { outcome.skipped += 1; continue; }
      const { summary, csv } = monthlySummary(dashboard as Dashboard);
      const dashboardPath = subscription.profile.role === "client_viewer" ? "/client" : subscription.profile.role === "team_manager" ? "/team" : "/hr/dashboard";
      const response = await sendHrNotificationEmail({
        to: subscription.profile.email, idempotencyKey: dedupeKey,
        attachments: [{ filename: `rapport-rh-${month}.csv`, content: `﻿${csv}` }],
        ...buildMonthlyReportEmail({ recipientName: subscription.profile.full_name, appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
          agencyName: subscription.agency.name, monthLabel, summary, dashboardPath }),
      });
      const { error: logError } = await admin.from("hr_notification_deliveries").insert({ kind: "MONTHLY_REPORT", dedupe_key: dedupeKey, recipient_profile_id: subscription.profile_id, provider_message_id: response.data?.id ?? null });
      if (logError && logError.code !== "23505") throw new Error("delivery log failed");
      outcome.sent += 1;
    } catch {
      outcome.failed += 1;
    }
  }
  return outcome;
}
