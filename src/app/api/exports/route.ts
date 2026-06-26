import { NextResponse, type NextRequest } from "next/server";

import { isAppRole } from "@/lib/admin/permissions";
import { apiError } from "@/lib/errors";
import { canCreateExport, type ExportType } from "@/lib/payroll/export";
import type { AppRole } from "@/lib/roles";
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

type ExportActor = {
  agencyId?: string | null;
  id: string;
  role: AppRole;
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

  return NextResponse.json({ data: { status: "PENDING", exportType } });
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
