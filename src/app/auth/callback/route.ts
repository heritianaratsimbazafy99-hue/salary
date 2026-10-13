import { NextRequest, NextResponse } from "next/server";

import { isAppRole } from "@/lib/admin/permissions";
import { acceptVerifiedEmployeeInvitation, INVITATION_CONTEXT_COOKIE, readInvitationContext } from "@/lib/employees/activation";
import { getPublicSupabaseConfig } from "@/lib/env.public";
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
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

function callbackDestination(path: string, request: NextRequest): URL {
  try {
    // Next/proxy request URLs may use an internal host. Keep session cookies on the public origin.
    return new URL(path, getPublicSupabaseConfig().appUrl);
  } catch {
    // The configuration error page must remain reachable when configuration is unavailable.
    return new URL(path, request.url);
  }
}

function loginRedirect(request: NextRequest, error: string): NextResponse {
  const path = request.cookies.has(INVITATION_CONTEXT_COOKIE) ? "/auth/invitation" : "/auth/login";
  return noStoreRedirect(NextResponse.redirect(callbackDestination(`${path}?error=${error}`, request)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const authToken = request.nextUrl.searchParams.get("token_hash");
  const invitationCookie = request.cookies.get(INVITATION_CONTEXT_COOKIE)?.value;

  // Reject scanner/forwarded links before consuming the one-time email proof.
  if (authToken) {
    const failed = () => noStoreRedirect(NextResponse.redirect(callbackDestination("/auth/invitation?error=activation_failed", request)));
    if (code || !invitationCookie || authToken.length > 256) return failed();
    try {
      const context = readInvitationContext(invitationCookie, authToken);
      if (!context) return failed();
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: authToken, type: "email" });
      if (error) return failed();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) return failed();
      const accepted = await acceptVerifiedEmployeeInvitation(data.user.id, context.invitationHash);
      const response = accepted
        ? noStoreRedirect(NextResponse.redirect(callbackDestination("/employee/payslips", request)))
        : failed();
      response.cookies.delete(INVITATION_CONTEXT_COOKIE);
      return response;
    } catch {
      return failed();
    }
  }

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

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authUserId = userData.user?.id;
  if (userError || !authUserId) return loginRedirect(request, "callback_failed");

  let redirectPath = "/auth/invitation?error=activation_failed";

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

  return noStoreRedirect(NextResponse.redirect(callbackDestination(redirectPath, request)));
}
