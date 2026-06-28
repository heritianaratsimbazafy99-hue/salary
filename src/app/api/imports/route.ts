import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanManagePayrollForAgency,
} from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { apiError } from "@/lib/errors";
import { persistPayrollImport } from "@/lib/payroll/import-service";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const EXCEL_XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_COMPATIBLE_MIME_TYPES = new Set([EXCEL_XLSX_MIME_TYPE, "application/zip"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseAllowedContentLength(contentLength: string | null): number | null {
  if (!contentLength) return null;

  const trimmedLength = contentLength.trim();
  if (!/^[0-9]+$/.test(trimmedLength)) {
    return null;
  }

  const parsedLength = Number(trimmedLength);
  if (parsedLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return null;
  }

  return parsedLength;
}

function isMultipartFormData(contentType: string | null): boolean {
  if (typeof contentType !== "string") return false;

  const [mediaType, ...parameters] = contentType.split(";");
  if (mediaType.trim().toLowerCase() !== "multipart/form-data") return false;

  return parameters.some((parameter) => {
    const [name, ...valueParts] = parameter.split("=");
    if (name.trim().toLowerCase() !== "boundary") return false;

    const boundary = valueParts.join("=").trim();
    if (!boundary) return false;

    if (boundary.startsWith('"') && boundary.endsWith('"')) {
      return boundary.slice(1, -1).trim().length > 0;
    }

    return true;
  });
}

function getTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
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

  if (parseAllowedContentLength(request.headers.get("content-length")) == null) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid upload size"), {
      status: 422,
    });
  }

  if (!isMultipartFormData(request.headers.get("content-type"))) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid upload content type"), {
      status: 422,
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const agencyId = getTrimmedString(formData, "agencyId");
  const periodStart = getTrimmedString(formData, "periodStart");
  const periodEnd = getTrimmedString(formData, "periodEnd");

  if (!(file instanceof File)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Excel file is required"), {
      status: 422,
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "File exceeds 10 MB limit"), {
      status: 422,
    });
  }

  if (!isExcelWorkbookFile(file)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "A .xlsx Excel file is required"), {
      status: 422,
    });
  }

  if (!agencyId || !periodStart || !periodEnd) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Agency and period are required"), {
      status: 422,
    });
  }

  if (!isUuid(agencyId)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid agency id"), { status: 422 });
  }

  if (!isValidDateRange(periodStart, periodEnd)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid payroll period"), {
      status: 422,
    });
  }

  try {
    assertCanManagePayrollForAgency({
      actorAgencyId: actor.agencyId,
      requestedAgencyId: agencyId,
      role: actor.role,
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  try {
    await recordAuditEvent({
      action: "PAYROLL_IMPORT_ATTEMPTED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId,
      metadata: {
        agencyId,
        filename: file.name,
        periodEnd,
        periodStart,
        status: "UPLOADED",
      },
      resourceType: "payroll_import",
    });

    const summary = await persistPayrollImport({
      actor,
      agencyId,
      file,
      periodEnd,
      periodStart,
      supabase: createAdminClient(),
    });

    await recordAuditEvent({
      action: summary.status === "FAILED" ? "PAYROLL_IMPORT_FAILED" : "PAYROLL_IMPORT_COMPLETED",
      actorProfileId: actor.id,
      actorRole: actor.role,
      agencyId,
      metadata: {
        agencyId,
        filename: file.name,
        importId: summary.importId,
        periodEnd,
        periodStart,
        rowCount: summary.rowCount,
        status: summary.status,
      },
      resourceId: summary.importId,
      resourceType: "payroll_import",
    });

    return NextResponse.json({
      data: {
        importId: summary.importId,
        invalidRowCount: summary.invalidRowCount,
        status: summary.status,
        unknownColumns: summary.unknownColumns,
        unknownEmployeeCount: summary.unknownEmployeeCount,
        validRowCount: summary.validRowCount,
      },
    });
  } catch {
    return NextResponse.json(apiError("INTERNAL_ERROR", "Unable to process payroll import"), {
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

function isExcelWorkbookFile(file: File): boolean {
  const filename = file.name.trim().toLowerCase();
  if (!filename.endsWith(".xlsx")) return false;

  const mimeType = file.type.trim().toLowerCase();
  return mimeType.length === 0 || EXCEL_COMPATIBLE_MIME_TYPES.has(mimeType);
}

function isValidDateRange(periodStart: string, periodEnd: string): boolean {
  return isIsoDate(periodStart) && isIsoDate(periodEnd) && periodEnd >= periodStart;
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
