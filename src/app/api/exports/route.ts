import { NextResponse, type NextRequest } from "next/server";

import { isAppRole } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { apiError } from "@/lib/errors";
import { canCreateExport, type ExportType } from "@/lib/payroll/export";
import type { AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isExportType(value: unknown): value is ExportType {
  return value === "IMPORT_REPORT" || value === "PUBLISHED_PAYSLIPS";
}

function getExportType(body: unknown) {
  if (typeof body !== "object" || body == null || !("exportType" in body)) {
    return undefined;
  }

  return body.exportType;
}

function getAgencyId(body: unknown): string | null | undefined {
  if (typeof body !== "object" || body == null || !("agencyId" in body)) {
    return undefined;
  }

  if (typeof body.agencyId !== "string") {
    return null;
  }

  const agencyId = body.agencyId.trim();
  return UUID_PATTERN.test(agencyId) ? agencyId : null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseWriteClient = Pick<ReturnType<typeof createAdminClient>, "from">;

type ExportActor = {
  agencyId?: string | null;
  id: string;
  role: AppRole;
};

type ExportJobRecord = {
  export_type?: unknown;
  id?: unknown;
  status?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult, error: authError } = await supabase.auth.getUser();

  if (authError || !userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid JSON body"), { status: 422 });
  }

  const exportType = getExportType(body);
  if (!isExportType(exportType)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid export type"), { status: 422 });
  }

  const agencyId = getAgencyId(body);
  if (agencyId === null) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid agency id"), { status: 422 });
  }

  const actor = await loadExportActor(supabase, userResult.user.id);
  if (!actor) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  if (
    !canCreateExport({
      actorAgencyId: actor.agencyId,
      exportType,
      requestedAgencyId: agencyId,
      role: actor.role,
    })
  ) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  let exportJob;
  try {
    const admin = createAdminClient();
    exportJob = await createExportJob(admin, {
      actorProfileId: actor.id,
      agencyId: agencyId ?? null,
      exportType,
    });

    await recordAuditEvent({
      action: "PAYROLL_EXPORT_REQUESTED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId: exportJob.agencyId,
      metadata: {
        agencyId: exportJob.agencyId,
        exportJobId: exportJob.id,
        exportType: exportJob.exportType,
        status: exportJob.status,
      },
      resourceId: exportJob.id,
      resourceType: "export_job",
    });
  } catch {
    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to create export job"), {
      status: 500,
    });
  }

  return NextResponse.json({
    data: {
      exportJobId: exportJob.id,
      exportType: exportJob.exportType,
      status: exportJob.status,
    },
  });
}

async function createExportJob(
  supabase: SupabaseWriteClient,
  input: {
    actorProfileId: string;
    agencyId: string | null;
    exportType: ExportType;
  },
) {
  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      agency_id: input.agencyId,
      export_type: input.exportType,
      requested_by: input.actorProfileId,
      status: "PENDING",
    })
    .select("id,status,export_type")
    .single();

  const exportJob = data as ExportJobRecord | null;
  if (
    error ||
    typeof exportJob?.id !== "string" ||
    exportJob.status !== "PENDING" ||
    !isExportType(exportJob.export_type)
  ) {
    throw new Error("Unable to create export job");
  }

  return {
    agencyId: input.agencyId,
    exportType: exportJob.export_type,
    id: exportJob.id,
    status: exportJob.status,
  };
}

async function loadExportActor(
  supabase: SupabaseServerClient,
  authUserId: string,
): Promise<ExportActor | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("auth_user_id", authUserId)
    .single();

  if (profileError || typeof profile?.id !== "string" || !isAppRole(profile.role)) {
    return null;
  }

  if (profile.role !== "agency_manager") {
    return {
      id: profile.id,
      role: profile.role,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("agency_id")
    .eq("profile_id", profile.id)
    .single();

  if (membershipError || typeof membership?.agency_id !== "string") {
    return null;
  }

  return {
    agencyId: membership.agency_id,
    id: profile.id,
    role: profile.role,
  };
}
