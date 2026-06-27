import { NextRequest, NextResponse } from "next/server";

import { isAppRole } from "@/lib/admin/permissions";
import type { AppRole } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ROLE_REDIRECTS: Record<AppRole, string> = {
  agency_manager: "/manager/imports",
  employee: "/employee/payslips",
  hr_central: "/hr/analytics",
  super_admin: "/hr/analytics",
};

function noStoreRedirect(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}

function loginRedirect(request: NextRequest, error: string): NextResponse {
  return noStoreRedirect(NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return loginRedirect(request, "missing_code");
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return loginRedirect(request, "missing_config");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return loginRedirect(request, "callback_failed");
  }

  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData.user?.id;
  let redirectPath = "/";

  if (authUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("auth_user_id", authUserId)
      .single();

    if (isAppRole(profile?.role)) {
      redirectPath = ROLE_REDIRECTS[profile.role];
    }
  }

  return noStoreRedirect(NextResponse.redirect(new URL(redirectPath, request.url)));
}
