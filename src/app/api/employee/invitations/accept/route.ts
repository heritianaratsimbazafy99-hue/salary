import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const AcceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});

type AcceptInvitationRpcRecord = {
  agency_id?: unknown;
  employee_id?: unknown;
  status?: unknown;
};

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid JSON body"), { status: 422 });
  }

  const parsed = AcceptInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid invitation token"), {
      status: 422,
    });
  }

  const supabase = await createClient();
  const { data: userResult, error: authError } = await supabase.auth.getUser();
  const authUserId = userResult.user?.id;

  if (authError || !authUserId) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  const admin = createAdminClient();
  const tokenHash = sha256Hex(parsed.data.token);
  const { data, error } = await admin.rpc("accept_employee_invitation", {
    p_auth_user_id: authUserId,
    p_token_hash: tokenHash,
  });

  if (error) {
    const response = acceptRpcErrorResponse(error);
    if (response) return response;

    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to accept invitation"), {
      status: 500,
    });
  }

  const accepted = parseAcceptInvitationRecord(data);

  if (!accepted) {
    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to accept invitation"), {
      status: 500,
    });
  }

  return NextResponse.json({
    data: {
      agencyId: accepted.agencyId,
      employeeId: accepted.employeeId,
      status: accepted.status,
    },
  });
}

function acceptRpcErrorResponse(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error) || typeof error.message !== "string") {
    return null;
  }

  if (error.message === "forbidden") {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  if (error.message === "not_found") {
    return NextResponse.json(apiError("NOT_FOUND", "Invitation not found"), { status: 404 });
  }

  return null;
}

function parseAcceptInvitationRecord(data: unknown) {
  const record = (Array.isArray(data) ? data[0] : data) as AcceptInvitationRpcRecord | null;

  if (
    !record ||
    typeof record.agency_id !== "string" ||
    typeof record.employee_id !== "string" ||
    record.status !== "ACCEPTED"
  ) {
    return null;
  }

  return {
    agencyId: record.agency_id,
    employeeId: record.employee_id,
    status: record.status,
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
