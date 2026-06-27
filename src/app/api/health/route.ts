import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type HealthBody = {
  checks: {
    app: "ok";
    email: "configured" | "missing";
    supabase: "ok" | "error";
  };
  status: "ok" | "degraded";
  timestamp: string;
};

export async function GET() {
  const timestamp = new Date().toISOString();
  const email = resolveEmailCheck();

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
          email,
          supabase: "ok",
        },
        status: email === "configured" ? "ok" : "degraded",
        timestamp,
      },
      email === "configured" ? 200 : 503,
    );
  } catch {
    return healthResponse(
      {
        checks: {
          app: "ok",
          email,
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

export function resolveEmailCheck(env: NodeJS.ProcessEnv = process.env): HealthBody["checks"]["email"] {
  return hasValue(env.RESEND_API_KEY) && hasValue(env.RESEND_FROM_EMAIL) ? "configured" : "missing";
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
