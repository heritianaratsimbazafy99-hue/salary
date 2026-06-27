import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

const localSupabaseUrl = assertLocalE2EUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421",
  "E2E Supabase",
);
// Local Supabase publishable key from `supabase status`; safe for browser/E2E use and overrideable.
const localSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const localAppUrl = assertLocalE2EUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000", "E2E app");
const localSupabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? readSupabaseStatusValue("SERVICE_ROLE_KEY");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: 0,
  workers: 1,
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
      ...(localSupabaseServiceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: localSupabaseServiceRoleKey } : {}),
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});

function readSupabaseStatusValue(key: string): string | undefined {
  try {
    const rawStatus = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const status = JSON.parse(rawStatus) as Record<string, unknown>;
    const value = status[key];
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function assertLocalE2EUrl(rawUrl: string, label: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} URL is invalid: ${rawUrl}`);
  }

  if (!["http:", "https:"].includes(url.protocol) || !isLoopbackHost(url.hostname)) {
    throw new Error(`${label} URL must target localhost/127.0.0.1 for destructive E2E tests.`);
  }

  return url.toString();
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]";
}
