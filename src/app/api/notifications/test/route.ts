import { NextResponse } from "next/server";

import { apiError } from "@/lib/errors";
import { publicEnv } from "@/lib/env.public";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_APP_URL = "http://localhost:3000";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(apiError("NOT_FOUND", "Not found"), { status: 404 });
  }

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  return NextResponse.json({
    data: buildPayslipPublishedEmail({
      employeeName: "Exemple",
      appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
    }),
  });
}
