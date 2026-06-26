import { defineConfig, devices } from "@playwright/test";

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

const localSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421";
// Local Supabase publishable key from `supabase status`; safe for browser/E2E use and overrideable.
const localSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const localAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run dev",
    env: {
      ...inheritedEnv,
      NEXT_PUBLIC_APP_URL: localAppUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabasePublishableKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrl,
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
