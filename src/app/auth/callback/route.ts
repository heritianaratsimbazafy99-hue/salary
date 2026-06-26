import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  return noStoreRedirect(NextResponse.redirect(new URL("/", request.url)));
}
