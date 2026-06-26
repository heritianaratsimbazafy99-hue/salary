import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  isAppRole,
} from "@/lib/admin/permissions";

type SupabaseEmployeeClient = Pick<SupabaseClient, "auth" | "from">;

type EmployeeProfileRow = {
  id?: unknown;
  role?: unknown;
};

type EmployeePayslipDbRow = {
  current_version?: unknown;
  employee?: unknown;
  period_end?: unknown;
  period_start?: unknown;
};

type EmployeeRelation = {
  full_name?: unknown;
  profile_id?: unknown;
};

type PayslipVersionRelation = {
  pay_items?: unknown;
  snapshot_data?: unknown;
};

type SnapshotData = {
  deductionsTotal?: unknown;
  grossAmount?: unknown;
  netAmount?: unknown;
};

type PayItemRecord = {
  amount?: unknown;
  category?: unknown;
  id?: unknown;
  label?: unknown;
  text?: unknown;
};

export type EmployeePayslip = {
  deductionsTotal: number;
  employeeName: string;
  grossAmount: number;
  netAmount: number;
  payItems: Array<
    | { id: string; label: string; category: string; amount: number }
    | { id: string; label: string; category: string; text: string }
  >;
  periodLabel: string;
};

const EMPLOYEE_PAYSLIP_COLUMNS = `
  id,
  period_start,
  period_end,
  employee:employees!inner(id,employee_id,full_name,profile_id),
  current_version:payslip_versions!payslips_current_version_fk(id,snapshot_data,pay_items)
`;

export async function loadCurrentEmployeePayslip(
  supabase: SupabaseEmployeeClient,
): Promise<EmployeePayslip | null> {
  const profile = await loadCurrentEmployeeProfile(supabase);

  const { data, error } = await supabase
    .from("payslips")
    .select(EMPLOYEE_PAYSLIP_COLUMNS)
    .not("current_version_id", "is", null)
    .eq("employee.profile_id", profile.id)
    .order("period_start", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error("Impossible de charger les fiches de paie.");
  }

  const row = Array.isArray(data) ? (data[0] as EmployeePayslipDbRow | undefined) : undefined;

  return row ? mapEmployeePayslip(row, profile.id) : null;
}

async function loadCurrentEmployeeProfile(supabase: SupabaseEmployeeClient) {
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims.sub;

  if (claimsError || !authUserId) {
    throw new Error(AUTH_REQUIRED_ERROR_MESSAGE);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("auth_user_id", authUserId)
    .single();

  const profile = data as EmployeeProfileRow | null;
  if (error || typeof profile?.id !== "string" || !isAppRole(profile.role)) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  if (profile.role !== "employee") {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  return {
    id: profile.id,
    role: profile.role,
  };
}

function mapEmployeePayslip(row: EmployeePayslipDbRow, profileId: string): EmployeePayslip {
  const employee = oneRelation<EmployeeRelation>(row.employee);
  const currentVersion = oneRelation<PayslipVersionRelation>(row.current_version);
  const snapshot = recordValue(currentVersion.snapshot_data) as SnapshotData;

  if (employee.profile_id !== profileId) {
    throw new Error(FORBIDDEN_ERROR_MESSAGE);
  }

  return {
    deductionsTotal: requiredNumber(snapshot.deductionsTotal),
    employeeName: requiredString(employee.full_name),
    grossAmount: requiredNumber(snapshot.grossAmount),
    netAmount: requiredNumber(snapshot.netAmount),
    payItems: mapPayItems(currentVersion.pay_items),
    periodLabel: `${requiredString(row.period_start)} - ${requiredString(row.period_end)}`,
  };
}

function mapPayItems(value: unknown): EmployeePayslip["payItems"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index): EmployeePayslip["payItems"] => {
    const record = recordValue(item) as PayItemRecord;
    const label = optionalString(record.label);
    const category = optionalString(record.category);

    if (!label || !category) return [];

    const id = optionalString(record.id) ?? `${index}-${label}`;
    const amount = optionalNumber(record.amount);
    if (amount !== undefined) {
      return [{ amount, category, id, label }];
    }

    const text = optionalString(record.text);
    if (text) {
      return [{ category, id, label, text }];
    }

    return [];
  });
}

function oneRelation<T>(value: unknown): T {
  const relation = Array.isArray(value) ? value[0] : value;

  if (relation && typeof relation === "object" && !Array.isArray(relation)) {
    return relation as T;
  }

  throw new Error("Fiche de paie invalide.");
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error("Fiche de paie invalide.");
}

function requiredString(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error("Fiche de paie invalide.");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredNumber(value: unknown): number {
  const number = optionalNumber(value);
  if (number !== undefined) return number;

  throw new Error("Fiche de paie invalide.");
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
