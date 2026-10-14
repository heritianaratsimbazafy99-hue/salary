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
const localAppUrl = assertLocalE2EUrl(process.env.E2E_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000", "E2E app");
const localSupabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? readSupabaseStatusValue("SERVICE_ROLE_KEY");
const localResendApiKey = process.env.RESEND_API_KEY ?? ["re", "local_e2e_resend_key_placeholder"].join("_");
// Local placeholder for the Vercel Cron bearer (not a real secret; production sets its own).
const localCronSecret = process.env.CRON_SECRET ?? ["local", "e2e", "cron", "bearer", "placeholder", "0001"].join("-");
const localResendFromEmail = process.env.RESEND_FROM_EMAIL ?? "MadajobPay <no-reply@local.test>";
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === "1";
const localAppPort = new URL(localAppUrl).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Keep load-test manifests and release evidence outside Playwright's cleanup.
  outputDir: "./test-results/playwright",
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: localAppUrl,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: [{
    command: "node tests/e2e/helpers/mail-server.mjs",
    url: "http://127.0.0.1:55428/health",
    reuseExistingServer: true,
  }, {
    command: `${useProductionBuild ? "npm run start" : "npm run dev"} -- --port ${localAppPort}`,
    env: {
      ...inheritedEnv,
      NEXT_PUBLIC_APP_URL: localAppUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabasePublishableKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrl,
      RESEND_API_KEY: localResendApiKey,
      RESEND_FROM_EMAIL: localResendFromEmail,
      RESEND_BASE_URL: "http://127.0.0.1:55428",
      CRON_SECRET: localCronSecret,
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      ...(localSupabaseServiceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: localSupabaseServiceRoleKey } : {}),
    },
    url: localAppUrl,
    // Fail on a port conflict instead of testing an unrelated local project.
    reuseExistingServer: false,
  }],
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
