import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function loginRedirect(request: NextRequest, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url));
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

  return NextResponse.redirect(new URL("/", request.url));
}
