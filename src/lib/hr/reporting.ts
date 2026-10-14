import "server-only";
import { z } from "zod";
import { requireCanAdministerHrAccess } from "../admin/auth";
import { toCsv } from "../payroll/csv";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";
import { CONTRACT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, LEAVE_TYPE_LABEL, type HrContractType, type HrEmployeeStatus, type HrLeaveType } from "./labels";
import { REPLACEMENT_STATUS_LABEL, type HrReplacementStatus } from "./planning";

export type DashboardSite = {
  site_id: string; site_name: string; site_code: string; headcount: number; assigned: number; absence_days: number | null;
  open_replacements: number; confirmed_replacements: number; contracts_ending_30: number;
};
export type ExpiringContract = { employee_id: string; full_name: string; matricule: string; site_name: string; contract_type: HrContractType; contract_end: string; days_left: number };
export type Dashboard = {
  period: { start: string; end: string; business_days: number; today: string };
  role: string;
  sites: DashboardSite[];
  totals: {
    headcount: number; assigned: number; entries: number; exits: number; absence_days: number | null; open_replacements: number; confirmed_replacements: number;
    avg_replacement_hours: number | null; contracts_ending_30: number; contracts_ending_60: number; contracts_ending_90: number; pending_leaves: number | null;
  };
  hr: { open_requests: number; in_progress_requests: number; avg_resolution_hours: number | null; cnaps_to_declare: number; cnaps_to_regularize: number; missing_files: number } | null;
  expiring: ExpiringContract[];
};

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Coverage = active employees under contract with an active assignment (not contractual post coverage). */
export function coverageRate(headcount: number, assigned: number) {
  return headcount > 0 ? assigned / headcount : 0;
}

/** Absenteeism = approved absence business days / (active headcount × business days of the month). */
export function absenteeismRate(absenceDays: number | null, headcount: number, businessDays: number) {
  if (absenceDays === null || headcount <= 0 || businessDays <= 0) return null;
  return absenceDays / (headcount * businessDays);
}

/** Indicators for the signed-in user; the database applies role and scope. */
export async function getDashboard(input: { agencyId?: string; month?: string } = {}): Promise<Dashboard | null> {
  const client = await createClient();
  const { data, error } = await client.rpc("hr_dashboard", {
    p_agency_id: input.agencyId && uuid.safeParse(input.agencyId).success ? input.agencyId : null,
    p_month: input.month && month.safeParse(input.month).success ? `${input.month}-01` : null,
  });
  if (error) throw new Error("Impossible de calculer les indicateurs.");
  return (data ?? null) as Dashboard | null;
}

export const HR_REPORT_KINDS = ["workforce", "leaves", "replacements"] as const;
export type HrReportKind = (typeof HR_REPORT_KINDS)[number];

type DirectoryRow = { matricule: string; full_name: string; job_title: string | null; department_name: string | null; site_name: string | null; team_name: string | null;
  manager_name: string | null; status: HrEmployeeStatus | null; contract_type: HrContractType | null; contract_start: string | null; contract_end: string | null };

/**
 * Builds a CSV for the caller's scope. Workforce and replacements follow the
 * role scope; approved leaves (for the payroll provider) are HR-only and return
 * an empty file otherwise. Cells are neutralised against spreadsheet formulas.
 */
export async function buildReportCsv(kind: HrReportKind, input: { agencyId?: string; from: string; to: string }): Promise<{ csv: string; rows: number }> {
  const client = await createClient();
  const agencyId = input.agencyId && uuid.safeParse(input.agencyId).success ? input.agencyId : null;
  if (kind === "workforce") {
    const rows: DirectoryRow[] = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const { data, error } = await client.rpc("hr_employee_directory", { p_agency_id: agencyId, p_limit: 100, p_offset: offset });
      if (error) throw new Error("Export impossible.");
      rows.push(...((data ?? []) as DirectoryRow[]));
      if ((data ?? []).length < 100) break;
    }
    return {
      rows: rows.length,
      csv: toCsv(["Matricule", "Nom", "Poste", "Département", "Site", "Équipe", "Responsable", "Statut", "Contrat", "Début", "Fin"],
        rows.map((r) => [r.matricule, r.full_name, r.job_title ?? "", r.department_name ?? "", r.site_name ?? "", r.team_name ?? "", r.manager_name ?? "",
          r.status ? EMPLOYEE_STATUS_LABEL[r.status] : "Dossier à compléter", r.contract_type ? CONTRACT_TYPE_LABEL[r.contract_type] : "", r.contract_start ?? "", r.contract_end ?? ""])),
    };
  }
  if (kind === "leaves") {
    const { data, error } = await client.rpc("hr_export_approved_leaves", { p_agency_id: agencyId, p_from: input.from, p_to: input.to });
    if (error) throw new Error("Export impossible.");
    const rows = (data ?? []) as Array<{ matricule: string; full_name: string; site_name: string | null; leave_type: HrLeaveType; start_date: string; end_date: string; days_in_period: number; leave_request_id: string }>;
    return {
      rows: rows.length,
      csv: toCsv(["Matricule", "Nom", "Site", "Type", "Début", "Fin", `Jours ouvrés du ${input.from} au ${input.to}`, "Référence congé"],
        rows.map((r) => [r.matricule, r.full_name, r.site_name ?? "", LEAVE_TYPE_LABEL[r.leave_type], r.start_date, r.end_date, r.days_in_period, r.leave_request_id])),
    };
  }
  const { data, error } = await client.rpc("hr_list_replacements", { p_agency_id: agencyId, p_status: null, p_limit: 500, p_offset: 0 });
  if (error) throw new Error("Export impossible.");
  const rows = ((data ?? []) as Array<{ site_name: string; absent_name: string; replacement_name: string | null; start_date: string; end_date: string; status: HrReplacementStatus }>)
    .filter((r) => r.start_date <= input.to && r.end_date >= input.from);
  return {
    rows: rows.length,
    csv: toCsv(["Site", "Collaborateur absent", "Remplaçant", "Début", "Fin", "Statut"],
      rows.map((r) => [r.site_name, r.absent_name, r.replacement_name ?? "", r.start_date, r.end_date, REPLACEMENT_STATUS_LABEL[r.status]])),
  };
}

export type ReportSubscription = { profile_id: string; kind: "CONTRACT_ALERTS" | "MONTHLY_REPORT"; agency_id: string };
export type ReportRecipient = { id: string; full_name: string; email: string; role: string; is_active: boolean };

export async function listReportSubscriptions(): Promise<{ subscriptions: ReportSubscription[]; recipients: ReportRecipient[] }> {
  await requireCanAdministerHrAccess();
  const client = await createClient();
  const [subscriptions, recipients] = await Promise.all([
    client.from("hr_report_subscriptions").select("profile_id,kind,agency_id"),
    client.from("profiles").select("id,full_name,email,role,is_active").in("role", ["hr_central", "super_admin", "team_manager", "client_viewer"]).eq("is_active", true).order("full_name"),
  ]);
  if (subscriptions.error || recipients.error) throw new Error("Impossible de charger les destinataires.");
  return { subscriptions: (subscriptions.data ?? []) as ReportSubscription[], recipients: recipients.data ?? [] };
}

export async function setReportSubscription(input: { profileId: string; kind: string; agencyId: string; enabled: boolean }): Promise<void> {
  const parsed = z.object({ profileId: uuid, kind: z.enum(["CONTRACT_ALERTS", "MONTHLY_REPORT"]), agencyId: uuid, enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) throw new Error("Champs invalides.");
  const actor = await requireCanAdministerHrAccess();
  const { error } = await createAdminClient().rpc("admin_set_report_subscription", {
    p_actor_id: actor.id, p_profile_id: parsed.data.profileId, p_kind: parsed.data.kind, p_agency_id: parsed.data.agencyId, p_enabled: parsed.data.enabled,
  });
  if (error) {
    throw new Error(error.message === "invalid_recipient"
      ? "Ce destinataire ne peut pas recevoir ce rapport : alertes réservées aux RH ; rapport client ou manager limité à son agence."
      : hrRpcErrorMessage(error, "Impossible de modifier l’abonnement."));
  }
}
