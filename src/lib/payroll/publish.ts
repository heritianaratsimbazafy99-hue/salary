import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";

type SupabaseWriteClient = Pick<SupabaseClient, "from">;

type PayrollImportRecord = {
  agency_id?: unknown;
  id?: unknown;
  period_end?: unknown;
  period_start?: unknown;
};

type PayrollImportRowRecord = {
  employee_email?: unknown;
  employee_id?: unknown;
  employee_name?: unknown;
  normalized_data?: unknown;
  pay_items?: unknown;
};

type EmployeeRecord = {
  email?: unknown;
  id?: unknown;
  profile_id?: unknown;
};

type PayslipRecord = {
  current_version_id?: unknown;
  id?: unknown;
};

type PayslipVersionRecord = {
  id?: unknown;
  version_number?: unknown;
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

export function nextVersionNumber(existingVersions: number[]) {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export type PublishResult = {
  payslipId: string;
  versionId: string;
  versionNumber: number;
};

export async function publishPayrollImport(input: {
  actor: AgencyScopedActor;
  createWriteSupabase: () => SupabaseWriteClient;
  importId: string;
  readSupabase: SupabaseWriteClient;
}): Promise<PublishImportResult> {
  const payrollImport = await loadPayrollImport(input.readSupabase, input.importId);

  assertCanManagePayrollForAgency({
    actorAgencyId: input.actor.agencyId,
    requestedAgencyId: payrollImport.agencyId,
    role: input.actor.role,
  });

  const importRows = await loadPayrollImportRows(
    input.readSupabase,
    input.importId,
    payrollImport.agencyId,
  );
  const writeSupabase = input.createWriteSupabase();

  for (const row of importRows) {
    const employee = await upsertEmployee(writeSupabase, payrollImport.agencyId, row);
    const payslip = await getOrCreatePayslip(writeSupabase, {
      actorProfileId: input.actor.id,
      agencyId: payrollImport.agencyId,
      employeeId: employee.id,
      periodEnd: payrollImport.periodEnd,
      periodStart: payrollImport.periodStart,
    });
    const version = await createPayslipVersion(writeSupabase, {
      actorProfileId: input.actor.id,
      agencyId: payrollImport.agencyId,
      currentVersionId: payslip.currentVersionId,
      importId: input.importId,
      normalizedData: row.normalizedData,
      payItems: row.payItems,
      payslipId: payslip.id,
    });

    await updatePayslipCurrentVersion(writeSupabase, {
      actorProfileId: input.actor.id,
      agencyId: payrollImport.agencyId,
      payslipId: payslip.id,
      versionId: version.versionId,
    });

    await createPayslipNotification(writeSupabase, {
      employee,
      payslipId: payslip.id,
    });
  }

  const { error } = await writeSupabase
    .from("payroll_imports")
    .update({ status: "PUBLISHED" })
    .eq("id", input.importId)
    .eq("agency_id", payrollImport.agencyId);

  if (error) {
    throw new Error("Impossible de mettre a jour le statut de l'import.");
  }

  return {
    agencyId: payrollImport.agencyId,
    importId: input.importId,
    periodEnd: payrollImport.periodEnd,
    periodStart: payrollImport.periodStart,
    publishedCount: importRows.length,
    status: "PUBLISHED",
  };
}

async function loadPayrollImport(supabase: SupabaseWriteClient, importId: string) {
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
    typeof payrollImport.period_end !== "string"
  ) {
    throw new Error("Import invalide.");
  }

  return {
    agencyId: payrollImport.agency_id,
    periodEnd: payrollImport.period_end,
    periodStart: payrollImport.period_start,
  };
}

async function loadPayrollImportRows(
  supabase: SupabaseWriteClient,
  importId: string,
  agencyId: string,
) {
  const { data, error } = await supabase
    .from("payroll_import_rows")
    .select("employee_id,employee_email,employee_name,normalized_data,pay_items")
    .eq("import_id", importId)
    .eq("agency_id", agencyId);

  if (error) {
    throw new Error("Impossible de charger les lignes d'import.");
  }

  return ((data ?? []) as PayrollImportRowRecord[]).map((row) => {
    if (
      typeof row.employee_id !== "string" ||
      typeof row.employee_email !== "string" ||
      typeof row.employee_name !== "string" ||
      row.normalized_data == null
    ) {
      throw new Error("Ligne d'import invalide.");
    }

    return {
      employeeEmail: row.employee_email.trim().toLowerCase(),
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      normalizedData: row.normalized_data,
      payItems: Array.isArray(row.pay_items) ? row.pay_items : [],
    };
  });
}

async function upsertEmployee(
  supabase: SupabaseWriteClient,
  agencyId: string,
  row: {
    employeeEmail: string;
    employeeId: string;
    employeeName: string;
  },
) {
  const { data, error } = await supabase
    .from("employees")
    .upsert(
      {
        agency_id: agencyId,
        email: row.employeeEmail,
        employee_id: row.employeeId,
        full_name: row.employeeName,
        is_active: true,
      },
      { onConflict: "agency_id,employee_id" },
    )
    .select("id,profile_id,email")
    .single();

  const employee = data as EmployeeRecord | null;
  if (error || typeof employee?.id !== "string" || typeof employee.email !== "string") {
    throw new Error("Impossible d'enregistrer l'employe.");
  }

  return {
    email: employee.email,
    id: employee.id,
    profileId: typeof employee.profile_id === "string" ? employee.profile_id : null,
  };
}

async function getOrCreatePayslip(
  supabase: SupabaseWriteClient,
  input: {
    actorProfileId: string;
    agencyId: string;
    employeeId: string;
    periodEnd: string;
    periodStart: string;
  },
) {
  const { data: existingPayslip, error: existingPayslipError } = await supabase
    .from("payslips")
    .select("id,current_version_id")
    .eq("agency_id", input.agencyId)
    .eq("employee_id", input.employeeId)
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd)
    .maybeSingle();

  if (existingPayslipError) {
    throw new Error("Impossible de charger le bulletin existant.");
  }

  const payslip = existingPayslip as PayslipRecord | null;
  if (payslip) {
    if (typeof payslip.id !== "string") {
      throw new Error("Bulletin existant invalide.");
    }

    return {
      currentVersionId:
        typeof payslip.current_version_id === "string" ? payslip.current_version_id : null,
      id: payslip.id,
    };
  }

  const { data: createdPayslip, error: createPayslipError } = await supabase
    .from("payslips")
    .insert({
      agency_id: input.agencyId,
      employee_id: input.employeeId,
      period_end: input.periodEnd,
      period_start: input.periodStart,
      published_by: input.actorProfileId,
    })
    .select("id,current_version_id")
    .single();

  const newPayslip = createdPayslip as PayslipRecord | null;
  if (createPayslipError || typeof newPayslip?.id !== "string") {
    throw new Error("Impossible de creer le bulletin.");
  }

  return {
    currentVersionId:
      typeof newPayslip.current_version_id === "string" ? newPayslip.current_version_id : null,
    id: newPayslip.id,
  };
}

async function createPayslipVersion(
  supabase: SupabaseWriteClient,
  input: {
    actorProfileId: string;
    agencyId: string;
    currentVersionId: string | null;
    importId: string;
    normalizedData: unknown;
    payItems: unknown[];
    payslipId: string;
  },
): Promise<PublishResult> {
  const { data: existingVersions, error: versionLoadError } = await supabase
    .from("payslip_versions")
    .select("version_number")
    .eq("payslip_id", input.payslipId);

  if (versionLoadError) {
    throw new Error("Impossible de charger les versions existantes.");
  }

  const versionNumber = nextVersionNumber(
    ((existingVersions ?? []) as PayslipVersionRecord[])
      .map((version) => version.version_number)
      .filter((versionNumber): versionNumber is number => typeof versionNumber === "number"),
  );

  if (input.currentVersionId) {
    const { error } = await supabase
      .from("payslip_versions")
      .update({ replaced_at: new Date().toISOString() })
      .eq("id", input.currentVersionId)
      .eq("payslip_id", input.payslipId)
      .is("replaced_at", null);

    if (error) {
      throw new Error("Impossible de remplacer la version courante.");
    }
  }

  const { data: version, error: versionCreateError } = await supabase
    .from("payslip_versions")
    .insert({
      agency_id: input.agencyId,
      import_id: input.importId,
      pay_items: input.payItems,
      payslip_id: input.payslipId,
      published_by: input.actorProfileId,
      snapshot_data: input.normalizedData,
      version_number: versionNumber,
    })
    .select("id")
    .single();

  const createdVersion = version as PayslipVersionRecord | null;
  if (versionCreateError || typeof createdVersion?.id !== "string") {
    throw new Error("Impossible de creer la version du bulletin.");
  }

  return {
    payslipId: input.payslipId,
    versionId: createdVersion.id,
    versionNumber,
  };
}

async function updatePayslipCurrentVersion(
  supabase: SupabaseWriteClient,
  input: {
    actorProfileId: string;
    agencyId: string;
    payslipId: string;
    versionId: string;
  },
) {
  const { error } = await supabase
    .from("payslips")
    .update({
      current_version_id: input.versionId,
      published_at: new Date().toISOString(),
      published_by: input.actorProfileId,
    })
    .eq("id", input.payslipId)
    .eq("agency_id", input.agencyId);

  if (error) {
    throw new Error("Impossible de mettre a jour la version courante du bulletin.");
  }
}

async function createPayslipNotification(
  supabase: SupabaseWriteClient,
  input: {
    employee: {
      email: string;
      profileId: string | null;
    };
    payslipId: string;
  },
) {
  const { error } = await supabase.from("notifications").insert({
    notification_type: "PAYSLIP_PUBLISHED",
    recipient_email: input.employee.email.toLowerCase(),
    recipient_profile_id: input.employee.profileId,
    resource_id: input.payslipId,
    resource_type: "payslip",
    status: "PENDING",
  });

  if (error) {
    throw new Error("Impossible de creer la notification.");
  }
}
