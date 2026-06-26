import { NextResponse, type NextRequest } from "next/server";

import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function isContentLengthTooLarge(contentLength: string | null) {
  if (!contentLength) {
    return false;
  }

  const parsedLength = Number(contentLength);
  if (!Number.isFinite(parsedLength)) {
    return false;
  }

  return parsedLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
}

function getTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  if (isContentLengthTooLarge(request.headers.get("content-length"))) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "File exceeds 10 MB limit"), {
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

  if (!agencyId || !periodStart || !periodEnd) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Agency and period are required"), {
      status: 422,
    });
  }

  return NextResponse.json({
    data: {
      status: "UPLOADED",
      filename: file.name,
      agencyId,
      periodStart,
      periodEnd,
    },
  });
}
