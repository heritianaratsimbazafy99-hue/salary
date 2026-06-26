import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "../env.public";
import { requireSupabaseServiceRoleKey } from "../env.server";

export function createAdminSupabaseClient() {
  const { supabaseUrl } = getPublicSupabaseConfig();

  return createClient(supabaseUrl, requireSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
