import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type HealthBody = {
  checks: {
    app: "ok";
    email: "resend_excluded";
    supabase: "ok" | "error";
  };
  status: "ok" | "degraded";
  timestamp: string;
};

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true });

    if (error) {
      throw error;
    }

    return healthResponse(
      {
        checks: {
          app: "ok",
          email: "resend_excluded",
          supabase: "ok",
        },
        status: "ok",
        timestamp,
      },
      200,
    );
  } catch {
    return healthResponse(
      {
        checks: {
          app: "ok",
          email: "resend_excluded",
          supabase: "error",
        },
        status: "degraded",
        timestamp,
      },
      503,
    );
  }
}

function healthResponse(body: HealthBody, status: number) {
  return NextResponse.json(body, {
    headers: {
      "cache-control": "no-store",
    },
    status,
  });
}
