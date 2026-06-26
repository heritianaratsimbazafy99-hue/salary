"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "../env.public";

export function createBrowserSupabaseClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicSupabaseConfig();

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

export const createClient = createBrowserSupabaseClient;
