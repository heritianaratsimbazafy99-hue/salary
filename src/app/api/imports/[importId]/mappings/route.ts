import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { apiError } from "@/lib/errors";
import {
  ResolveMappingConflictError,
  ResolveMappingNotFoundError,
  ResolveMappingValidationError,
  resolveImportColumnMappings,
} from "@/lib/payroll/mapping-resolution";
import { PAY_ITEM_CATEGORIES } from "@/lib/payroll/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MappingRequestSchema = z.object({
  mappings: z
    .array(
      z.object({
        displayLabel: z.string().trim().min(1).max(160),
        sourceColumn: z.string().trim().min(1).max(160),
        targetCategory: z.enum(PAY_ITEM_CATEGORIES),
      }),
    )
    .min(1)
    .max(100),
});

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

  if (!UUID_PATTERN.test(normalizedImportId)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Import id is required"), { status: 422 });
  }

  const payload = await parseMappingPayload(request);
  if (!payload.success) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid mapping payload"), {
      status: 422,
    });
  }

  try {
    const supabase = await createClient();
    const result = await resolveImportColumnMappings({
      actor,
      createWriteSupabase: createAdminClient,
      importId: normalizedImportId,
      mappings: payload.data.mappings,
      readSupabase: supabase,
    });

    await recordAuditEvent({
      action: "PAYROLL_IMPORT_MAPPING_RESOLVED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId: actor.agencyId,
      metadata: {
        importId: result.importId,
        mappedColumnCount: result.mappedColumnCount,
        status: result.status,
      },
      resourceId: result.importId,
      resourceType: "payroll_import",
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;

    if (error instanceof ResolveMappingNotFoundError) {
      return NextResponse.json(apiError("NOT_FOUND", "Import not found"), { status: 404 });
    }

    if (error instanceof ResolveMappingConflictError) {
      return NextResponse.json(
        apiError("CONFLICT", "Import cannot be mapped from current status", {
          status: error.status,
        }),
        { status: 409 },
      );
    }

    if (error instanceof ResolveMappingValidationError) {
      return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid mapping payload"), {
        status: 422,
      });
    }

    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to resolve mappings"), {
      status: 500,
    });
  }
}

async function parseMappingPayload(request: NextRequest) {
  try {
    return MappingRequestSchema.safeParse(await request.json());
  } catch {
    return MappingRequestSchema.safeParse(null);
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
