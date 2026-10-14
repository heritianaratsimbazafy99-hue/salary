import { PublicationConfirmationSchema } from "@/lib/payroll/manager-review";
import { apiError } from "@/lib/errors";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import {
  PublishConflictError,
  PublishNotFoundError,
  PublishIdentityConflictError,
  publishPayrollImport,
} from "@/lib/payroll/publish";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The bounded employee preparation and mail batches share one publication request.
export const maxDuration = 300;

export async function POST(request: NextRequest, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;
  const normalizedImportId = importId.trim();

  let actor;
  try {
    actor = await getCurrentAgencyScopedActor();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to authenticate request"), {
      status: 500,
    });
  }

  if (!isUuid(normalizedImportId)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Import id is required"), { status: 422 });
  }

  try {
    const confirmation = PublicationConfirmationSchema.safeParse(await request.json().catch(() => null));
    if (!confirmation.success) return NextResponse.json(apiError("VALIDATION_ERROR", "Confirmez les destinataires avant de publier."), { status: 422 });
    const supabase = await createClient();
    const result = await publishPayrollImport({
      actor,
      fingerprint: confirmation.data.fingerprint,
      createWriteSupabase: createAdminClient,
      importId: normalizedImportId,
      readSupabase: supabase,
    });

    await recordAuditEvent({
      action: "PAYROLL_IMPORT_PUBLISHED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId: result.agencyId,
      metadata: {
        agencyId: result.agencyId,
        emailFailedCount: result.emailFailedCount,
        emailSentCount: result.emailSentCount,
        importId: result.importId,
        notificationCount: result.notificationCount,
        periodEnd: result.periodEnd,
        periodStart: result.periodStart,
        rowCount: result.publishedCount,
        status: result.status,
      },
      resourceId: result.importId,
      resourceType: "payroll_import",
    });

    return NextResponse.json({
      data: {
        importId: result.importId,
        publishedCount: result.publishedCount,
        emailSentCount: result.emailSentCount,
        emailFailedCount: result.emailFailedCount,
        notificationCount: result.notificationCount,
        status: result.status,
      },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;

    if (error instanceof PublishIdentityConflictError) {
      return NextResponse.json(apiError("VALIDATION_ERROR", error.message, { reason: "IDENTITY_CONFLICT" }), { status: 422 });
    }

    if (error instanceof PublishNotFoundError) {
      return NextResponse.json(apiError("NOT_FOUND", "Import not found"), { status: 404 });
    }

    if (error instanceof PublishConflictError) {
      return NextResponse.json(
        apiError("CONFLICT", "La revue est périmée ou l’import est déjà publié. Rechargez les destinataires.", { status: error.status }),
        { status: 409 },
      );
    }

    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to publish payroll import"), {
      status: 500,
    });
  }
}

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;

  if (error.message === AUTH_REQUIRED_ERROR_MESSAGE) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  if (error.message === FORBIDDEN_ERROR_MESSAGE) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  return null;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
