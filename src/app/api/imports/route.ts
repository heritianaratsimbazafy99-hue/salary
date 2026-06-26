import { NextResponse, type NextRequest } from "next/server";

import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const agencyId = String(formData.get("agencyId") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");

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
