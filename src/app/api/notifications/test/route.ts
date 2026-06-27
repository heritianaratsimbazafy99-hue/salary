import { NextResponse } from "next/server";

import {
  canReadPayrollAnalytics,
  isAppRole,
} from "@/lib/admin/permissions";
import { apiError } from "@/lib/errors";
import { publicEnv } from "@/lib/env.public";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_APP_URL = "http://localhost:3000";

type ProfileLookupClient = {
  from: (table: "profiles") => {
    select: (columns: "role") => {
      eq: (
        column: "auth_user_id",
        value: string,
      ) => { single: () => Promise<{ data: { role?: unknown } | null }> };
    };
  };
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(apiError("NOT_FOUND", "Not found"), { status: 404 });
  }

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const authUserId = userResult.user?.id;

  if (!authUserId) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  const profileClient = supabase as unknown as Partial<ProfileLookupClient>;

  if (!hasProfileQuery(profileClient)) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  const { data: profile } = await profileClient
    .from("profiles")
    .select("role")
    .eq("auth_user_id", authUserId)
    .single();

  if (!isAppRole(profile?.role) || !canReadPayrollAnalytics(profile.role)) {
    return NextResponse.json(apiError("FORBIDDEN", "Forbidden"), { status: 403 });
  }

  return NextResponse.json({
    data: buildPayslipPublishedEmail({
      employeeName: "Exemple",
      appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
    }),
  });
}

function hasProfileQuery(client: Partial<ProfileLookupClient>): client is ProfileLookupClient {
  return (
    typeof client === "object" &&
    client !== null &&
    "from" in client &&
    typeof client.from === "function"
  );
}
