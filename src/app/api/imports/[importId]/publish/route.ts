import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(_request: NextRequest, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;
  const normalizedImportId = importId.trim();
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  if (!normalizedImportId) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Import id is required"), { status: 422 });
  }

  return NextResponse.json({ data: { importId: normalizedImportId, status: "PUBLISHED" } });
}
