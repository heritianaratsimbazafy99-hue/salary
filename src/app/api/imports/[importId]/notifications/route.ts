import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { publicEnv } from "@/lib/env.public";
import { apiError } from "@/lib/errors";
import { PublishConflictError, PublishNotFoundError } from "@/lib/payroll/publish";
import { retryImportNotifications } from "@/lib/payroll/retry-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: NextRequest, context: { params: Promise<{ importId: string }> }) {
  try {
    const origin = request.headers.get("origin");
    if (origin && (!publicEnv.NEXT_PUBLIC_APP_URL || origin !== new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin)) {
      return NextResponse.json(apiError("FORBIDDEN", "Origine non autorisée."), { status: 403 });
    }
    const actor = await getCurrentAgencyScopedActor();
    const { importId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) {
      return NextResponse.json(apiError("VALIDATION_ERROR", "Import invalide."), { status: 422 });
    }
    const { agencyId, ...counts } = await retryImportNotifications({ actor, importId, readSupabase: await createClient(), createWriteSupabase: createAdminClient });
    await recordAuditEvent({ action: "PAYROLL_NOTIFICATIONS_RETRIED", actorProfileId: actor.id, actorRole: actor.role, agencyId, resourceId: importId, resourceType: "payroll_import", metadata: counts });
    return NextResponse.json({ data: counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === AUTH_REQUIRED_ERROR_MESSAGE) return NextResponse.json(apiError("UNAUTHORIZED", "Authentification requise."), { status: 401 });
    if (message === FORBIDDEN_ERROR_MESSAGE) return NextResponse.json(apiError("FORBIDDEN", "Action non autorisée."), { status: 403 });
    if (error instanceof PublishNotFoundError) return NextResponse.json(apiError("NOT_FOUND", "Import introuvable."), { status: 404 });
    if (error instanceof PublishConflictError) return NextResponse.json(apiError("CONFLICT", "La reprise nécessite un import publié et une agence active."), { status: 409 });
    return NextResponse.json(apiError("INTERNAL_ERROR", "Impossible de reprendre les emails."), { status: 500 });
  }
}
