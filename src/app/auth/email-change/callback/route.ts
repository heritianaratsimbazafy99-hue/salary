import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseConfig } from "@/lib/env.public";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Auth verifies its email links first; this route only exchanges the PKCE code.
  // Finalisation is explicit on the owner's page and rechecks auth.users in SQL.
  if (code && code.length <= 2048) await (await createClient()).auth.exchangeCodeForSession(code);
  const response = NextResponse.redirect(new URL("/employee/email-change", getPublicSupabaseConfig().appUrl));
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response;
}
