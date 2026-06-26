import { NextResponse, type NextRequest } from "next/server";

import { apiError } from "@/lib/errors";
import type { ExportType } from "@/lib/payroll/export";
import { createClient } from "@/lib/supabase/server";

function isExportType(value: unknown): value is ExportType {
  return value === "IMPORT_REPORT" || value === "PUBLISHED_PAYSLIPS";
}

function getExportType(body: unknown) {
  if (typeof body !== "object" || body == null || !("exportType" in body)) {
    return undefined;
  }

  return body.exportType;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
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

  return NextResponse.json({ data: { status: "PENDING", exportType } });
}
