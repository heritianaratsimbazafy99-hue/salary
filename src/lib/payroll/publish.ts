import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import {
  ensureEmployeeAuthProfile,
  rollbackEmployeeAuthProfileProvisioning,
  type ProvisionedEmployeeAuthProfile,
} from "@/lib/employees/linking";

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
  importId: string;
  periodEnd: string;
  periodStart: string;
  publishedCount: number;
  status: "PUBLISHED";
};

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

  return {
    agencyId: result.agencyId,
    importId: result.importId,
    periodEnd: result.periodEnd,
    periodStart: result.periodStart,
    publishedCount: result.publishedCount,
    status: "PUBLISHED",
  };
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

function parsePublishRpcRecord(data: unknown): PublishImportResult {
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
