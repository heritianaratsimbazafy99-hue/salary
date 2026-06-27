import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { type Page, type TestInfo } from "@playwright/test";
import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

type AppRole = "agency_manager" | "employee" | "hr_central" | "super_admin";

type TestProfile = {
  authUserId: string;
  email: string;
  fullName: string;
  id: string;
  role: AppRole;
};

type SupabaseStatus = Record<string, unknown>;
type CapturedCookie = {
  name: string;
  value: string;
  options?: CapturedCookieOptions;
};
type CapturedCookieOptions = {
  httpOnly?: boolean;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

export type PayrollE2EFixture = {
  admin: SupabaseClient;
  agencyId: string;
  employeeEmail: string;
  hr: TestProfile;
  manager: TestProfile & { agencyId: string };
  password: string;
  periodEnd: string;
  periodStart: string;
  suffix: string;
  cleanup: () => Promise<void>;
};

const DEFAULT_SUPABASE_URL = "http://127.0.0.1:55421";
const DEFAULT_APP_URL = "http://127.0.0.1:3000";

export async function createPayrollE2EFixture(): Promise<PayrollE2EFixture> {
  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = createTestPassword(suffix);
  const employeeEmail = `codex-employee-${suffix}@example.com`;
  const periodStart = "2026-06-01";
  const periodEnd = "2026-06-30";
  const authUserIds: string[] = [];
  const profileIds: string[] = [];

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({
      code: `CX${suffix.slice(-6).toUpperCase()}`,
      name: `Codex Audit ${suffix}`,
    })
    .select("id")
    .single();

  if (agencyError || typeof agency?.id !== "string") {
    throw new Error(`Unable to create E2E agency: ${agencyError?.message ?? "missing id"}`);
  }

  const agencyId = agency.id;
  const manager = await createProfile(admin, {
    email: `codex-manager-${suffix}@example.com`,
    fullName: "Codex Manager",
    password,
    role: "agency_manager",
  });
  authUserIds.push(manager.authUserId);
  profileIds.push(manager.id);

  const { error: membershipError } = await admin.from("agency_memberships").insert({
    agency_id: agencyId,
    profile_id: manager.id,
  });

  if (membershipError) {
    throw new Error(`Unable to create manager membership: ${membershipError.message}`);
  }

  const hr = await createProfile(admin, {
    email: `codex-hr-${suffix}@example.com`,
    fullName: "Codex HR",
    password,
    role: "hr_central",
  });
  authUserIds.push(hr.authUserId);
  profileIds.push(hr.id);

  return {
    admin,
    agencyId,
    employeeEmail,
    hr,
    manager: { ...manager, agencyId },
    password,
    periodEnd,
    periodStart,
    suffix,
    cleanup: async () => {
      await cleanupPayrollFixture(admin, {
        agencyId,
        authUserIds,
        employeeEmail,
        profileIds,
      });
    },
  };
}

export async function createPayrollWorkbook(
  testInfo: TestInfo,
  input: { employeeEmail: string; periodEnd: string; periodStart: string; suffix: string },
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("payroll");
  worksheet.addRow([
    "employee_id",
    "email",
    "period_start",
    "period_end",
    "employee_name",
    "gross_amount",
    "deductions_total",
    "net_amount",
    "cafeteria",
  ]);
  worksheet.addRow([
    `emp-${input.suffix.slice(-6)}`,
    input.employeeEmail,
    input.periodStart,
    input.periodEnd,
    "Rina Salary",
    1_500_000,
    250_000,
    1_250_000,
    "2 500",
  ]);

  const filePath = testInfo.outputPath(path.join("fixtures", `payroll-${input.suffix}.xlsx`));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

export async function signInAsE2EUser(
  page: Page,
  input: { email: string; expectedPath: RegExp; password: string; targetPath: string },
) {
  await page.context().clearCookies();
  const supabase = createPublicClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    throw new Error(`Unable to create E2E browser session for ${input.email}: ${error?.message ?? "missing session"}`);
  }

  const cookies = await createSupabaseSessionCookies({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
  await page.context().addCookies(cookies);
  await page.goto(appUrl(input.targetPath));
  await page.waitForURL(input.expectedPath, { timeout: 15_000 });
}

export async function findEmployeeProfileByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,auth_user_id")
    .eq("email", email)
    .single();

  if (error || typeof data?.id !== "string" || typeof data.auth_user_id !== "string") {
    throw new Error(`Unable to find employee profile: ${error?.message ?? "missing profile"}`);
  }

  return {
    authUserId: data.auth_user_id,
    profileId: data.id,
  };
}

export async function enablePasswordLoginForE2E(
  admin: SupabaseClient,
  input: { authUserId: string; password: string },
) {
  const { error } = await admin.auth.admin.updateUserById(input.authUserId, {
    email_confirm: true,
    password: input.password,
  });

  if (error) {
    throw new Error(`Unable to enable E2E password login: ${error.message}`);
  }
}

export function appUrl(pathname: string) {
  return new URL(pathname, resolveAppUrl()).toString();
}

async function createProfile(
  admin: SupabaseClient,
  input: { email: string; fullName: string; password: string; role: AppRole },
): Promise<TestProfile> {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    password: input.password,
    user_metadata: {
      full_name: input.fullName,
      role: input.role,
    },
  });
  const authUserId = userData.user?.id;

  if (userError || !authUserId) {
    throw new Error(`Unable to create auth user: ${userError?.message ?? "missing user id"}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
    })
    .select("id")
    .single();

  if (profileError || typeof profile?.id !== "string") {
    await admin.auth.admin.deleteUser(authUserId);
    throw new Error(`Unable to create profile: ${profileError?.message ?? "missing profile id"}`);
  }

  return {
    authUserId,
    email: input.email,
    fullName: input.fullName,
    id: profile.id,
    role: input.role,
  };
}

async function cleanupPayrollFixture(
  admin: SupabaseClient,
  input: { agencyId: string; authUserIds: string[]; employeeEmail: string; profileIds: string[] },
) {
  const employeeProfile = await admin
    .from("profiles")
    .select("id,auth_user_id")
    .eq("email", input.employeeEmail)
    .maybeSingle();
  const allProfileIds = [...input.profileIds];
  const allAuthUserIds = [...input.authUserIds];

  if (typeof employeeProfile.data?.id === "string") allProfileIds.push(employeeProfile.data.id);
  if (typeof employeeProfile.data?.auth_user_id === "string") {
    allAuthUserIds.push(employeeProfile.data.auth_user_id);
  }

  await throwOnCleanupError(
    "clear payslip current versions",
    await admin.from("payslips").update({ current_version_id: null }).eq("agency_id", input.agencyId),
  );
  await throwOnCleanupError(
    "delete payslip versions",
    await admin.from("payslip_versions").delete().eq("agency_id", input.agencyId),
  );
  await throwOnCleanupError("delete payslips", await admin.from("payslips").delete().eq("agency_id", input.agencyId));
  await throwOnCleanupError(
    "delete payroll imports",
    await admin.from("payroll_imports").delete().eq("agency_id", input.agencyId),
  );
  await throwOnCleanupError("delete employees", await admin.from("employees").delete().eq("agency_id", input.agencyId));
  await throwOnCleanupError(
    "delete column mappings",
    await admin.from("column_mappings").delete().eq("agency_id", input.agencyId),
  );
  await throwOnCleanupError("delete agency audit logs", await admin.from("audit_logs").delete().eq("agency_id", input.agencyId));
  await throwOnCleanupError(
    "delete employee notifications",
    await admin.from("notifications").delete().eq("recipient_email", input.employeeEmail),
  );

  if (allProfileIds.length > 0) {
    await throwOnCleanupError("delete export jobs", await admin.from("export_jobs").delete().in("requested_by", allProfileIds));
    await throwOnCleanupError(
      "delete actor audit logs",
      await admin.from("audit_logs").delete().in("actor_profile_id", allProfileIds),
    );
    await throwOnCleanupError("delete profiles", await admin.from("profiles").delete().in("id", allProfileIds));
  }

  await throwOnCleanupError("delete agency", await admin.from("agencies").delete().eq("id", input.agencyId));

  await Promise.allSettled(allAuthUserIds.map((authUserId) => admin.auth.admin.deleteUser(authUserId)));
}

async function throwOnCleanupError(operation: string, result: { error: { message: string } | null }) {
  if (result.error) {
    throw new Error(`Unable to cleanup E2E fixture (${operation}): ${result.error.message}`);
  }
}

function createAdminClient() {
  return createClient(resolveSupabaseUrl(), resolveServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function createPublicClient() {
  return createClient(resolveSupabaseUrl(), resolvePublishableKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createSupabaseSessionCookies(input: { accessToken: string; refreshToken: string }) {
  const capturedCookies: CapturedCookie[] = [];
  const supabase = createSsrBrowserClient(resolveSupabaseUrl(), resolvePublishableKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
    },
    cookies: {
      getAll() {
        return capturedCookies;
      },
      setAll(cookiesToSet) {
        for (const cookieToSet of cookiesToSet) {
          const index = capturedCookies.findIndex((cookie) => cookie.name === cookieToSet.name);
          if (cookieToSet.value === "") {
            if (index >= 0) capturedCookies.splice(index, 1);
            continue;
          }

          const nextCookie: CapturedCookie = {
            name: cookieToSet.name,
            options: cookieToSet.options,
            value: cookieToSet.value,
          };

          if (index >= 0) {
            capturedCookies[index] = nextCookie;
          } else {
            capturedCookies.push(nextCookie);
          }
        }
      },
    },
  });

  const { error } = await supabase.auth.setSession({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
  });

  if (error) {
    throw new Error(`Unable to persist E2E Supabase session cookies: ${error.message}`);
  }

  return capturedCookies.map((cookie) => ({
    httpOnly: cookie.options?.httpOnly ?? false,
    name: cookie.name,
    sameSite: normalizeSameSite(cookie.options?.sameSite),
    secure: cookie.options?.secure ?? false,
    url: resolveAppUrl(),
    value: cookie.value,
  }));
}

function normalizeSameSite(value: CapturedCookieOptions["sameSite"]) {
  if (value === "strict") return "Strict" as const;
  if (value === "none") return "None" as const;
  return "Lax" as const;
}

function resolveAppUrl() {
  return assertLocalE2EUrl(process.env.E2E_APP_URL ?? DEFAULT_APP_URL, "E2E app");
}

function resolveSupabaseUrl() {
  return assertLocalE2EUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? readSupabaseStatusValue("API_URL") ?? DEFAULT_SUPABASE_URL,
    "E2E Supabase",
  );
}

function resolvePublishableKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    readSupabaseStatusValue("PUBLISHABLE_KEY") ??
    readSupabaseStatusValue("ANON_KEY");

  if (!key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or start local Supabase before running authenticated E2E.");
  }

  return key;
}

function resolveServiceRoleKey() {
  const key =
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
    readSupabaseStatusValue("SERVICE_ROLE_KEY") ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Set E2E_SUPABASE_SERVICE_ROLE_KEY or start local Supabase before running authenticated E2E.");
  }

  return key;
}

function readSupabaseStatusValue(key: string): string | undefined {
  try {
    const rawStatus = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const status = JSON.parse(rawStatus) as SupabaseStatus;
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
    throw new Error(`${label} URL must target localhost/127.0.0.1 for these destructive E2E fixtures.`);
  }

  return url.toString();
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]";
}

function createTestPassword(suffix: string) {
  return `MadajobPay.${suffix}.${randomUUID()}`;
}
