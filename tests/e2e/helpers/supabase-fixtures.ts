import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { type Page, type TestInfo } from "@playwright/test";
import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

type AppRole = "agency_manager" | "employee" | "hr_central" | "super_admin" | "team_manager" | "client_viewer";

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

export type HrE2EFixture = {
  admin: SupabaseClient;
  agencyId: string;
  hr: TestProfile;
  superAdmin: TestProfile;
  password: string;
  suffix: string;
  /** Emails of accounts created through the UI, removed with the fixture. */
  createdEmails: string[];
  cleanup: () => Promise<void>;
};

/** Agency + HR central + super admin. HR referential rows cascade with the agency. */
export async function createHrE2EFixture(): Promise<HrE2EFixture> {
  const admin = createAdminClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = createTestPassword(suffix);
  const authUserIds: string[] = [];
  const profileIds: string[] = [];
  const createdEmails: string[] = [];
  const { data: agency, error: agencyError } = await admin.from("agencies")
    .insert({ code: `HR${suffix.slice(-6).toUpperCase()}`, name: `Codex RH ${suffix}` }).select("id").single();
  if (agencyError || typeof agency?.id !== "string") throw new Error(`Unable to create HR E2E agency: ${agencyError?.message ?? "missing id"}`);
  const agencyId = agency.id;
  const cleanup = async () => {
    for (const email of createdEmails) {
      const { data } = await admin.from("profiles").select("id,auth_user_id").eq("email", email).maybeSingle();
      if (typeof data?.id === "string") profileIds.push(data.id);
      if (typeof data?.auth_user_id === "string") authUserIds.push(data.auth_user_id);
    }
    // Documents reference their uploader; tests remove the stored objects themselves.
    await throwOnCleanupError("delete HR documents", await admin.from("employee_documents").delete().eq("agency_id", agencyId));
    // Leave rows reference their authors (requested_by, decided_by, actor_profile_id).
    await throwOnCleanupError("delete HR requests", await admin.from("hr_requests").delete().eq("agency_id", agencyId));
    await throwOnCleanupError("delete replacements", await admin.from("hr_replacements").delete().eq("agency_id", agencyId));
    await throwOnCleanupError("delete assignments", await admin.from("hr_assignments").delete().eq("agency_id", agencyId));
    await throwOnCleanupError("delete leave movements", await admin.from("leave_balance_movements").delete().eq("agency_id", agencyId));
    await throwOnCleanupError("delete leave requests", await admin.from("leave_requests").delete().eq("agency_id", agencyId));
    await throwOnCleanupError("delete HR agency audit logs", await admin.from("audit_logs").delete().eq("agency_id", agencyId));
    if (profileIds.length) {
      await throwOnCleanupError("delete HR actor audit logs", await admin.from("audit_logs").delete().in("actor_profile_id", profileIds));
      await throwOnCleanupError("delete HR profiles", await admin.from("profiles").delete().in("id", profileIds));
    }
    await throwOnCleanupError("delete HR agency", await admin.from("agencies").delete().eq("id", agencyId));
    await Promise.allSettled(authUserIds.map((authUserId) => admin.auth.admin.deleteUser(authUserId)));
  };
  try {
    const hr = await createProfile(admin, { email: `codex-hr-${suffix}@example.com`, fullName: "Codex RH", password, role: "hr_central" });
    authUserIds.push(hr.authUserId); profileIds.push(hr.id);
    const superAdmin = await createProfile(admin, { email: `codex-super-${suffix}@example.com`, fullName: "Codex Super", password, role: "super_admin" });
    authUserIds.push(superAdmin.authUserId); profileIds.push(superAdmin.id);
    return { admin, agencyId, hr, superAdmin, password, suffix, createdEmails, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

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

export async function acceptEmployeeInvitationForE2E(
  admin: SupabaseClient,
  input: { agencyId: string; employeeEmail: string; fullName: string; password: string },
) {
  const employee = await createProfile(admin, {
    email: input.employeeEmail,
    fullName: input.fullName,
    password: input.password,
    role: "employee",
  });
  const { data: invitation, error: invitationError } = await admin
    .from("employee_invitations")
    .select("token_hash")
    .eq("agency_id", input.agencyId)
    .eq("email", input.employeeEmail)
    .eq("status", "PENDING")
    .single();
  const tokenHash = invitation?.token_hash;

  if (invitationError || typeof tokenHash !== "string") {
    throw new Error(`Unable to find employee invitation: ${invitationError?.message ?? "missing token hash"}`);
  }

  const { data: acceptedInvitation, error: acceptError } = await admin.rpc("accept_employee_invitation", {
    p_auth_user_id: employee.authUserId,
    p_token_hash: tokenHash,
  });
  const accepted = Array.isArray(acceptedInvitation) ? acceptedInvitation[0] : acceptedInvitation;

  if (
    acceptError ||
    !accepted ||
    accepted.agency_id !== input.agencyId ||
    accepted.status !== "ACCEPTED"
  ) {
    throw new Error(`Unable to accept employee invitation: ${acceptError?.message ?? "unexpected RPC response"}`);
  }

  return {
    authUserId: employee.authUserId,
    profileId: employee.id,
  };
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
  } else {
    // Activation may fail after creating an unconfirmed Auth user but before its profile exists.
    // Clean up this fixture's exact recipient as well, without touching other tests' users.
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`Unable to find activation user during cleanup: ${error.message}`);
      const user = data.users.find((candidate) => candidate.email === input.employeeEmail);
      if (user) allAuthUserIds.push(user.id);
      if (user || data.users.length < 1000) break;
    }
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
  await throwOnCleanupError(
    "delete employee invitations",
    await admin.from("employee_invitations").delete().eq("agency_id", input.agencyId),
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
  return assertLocalE2EUrl(process.env.E2E_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL, "E2E app");
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

/** Calls a service-role RPC of the HR module and fails loudly. */
export async function hrRpc<T>(fixture: HrE2EFixture, name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await fixture.admin.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

/** Site + department of the fixture agency, created through the HR RPCs. */
export async function createHrOrganisation(fixture: HrE2EFixture, label = "E2E") {
  const siteId = await hrRpc<string>(fixture, "hr_save_site", { p_actor_id: fixture.hr.id, p_site_id: null, p_agency_id: fixture.agencyId, p_name: `Site ${label}`, p_code: label.toUpperCase().slice(0, 32), p_active: true, p_revision: null });
  const departmentId = await hrRpc<string>(fixture, "hr_save_department", { p_actor_id: fixture.hr.id, p_department_id: null, p_agency_id: fixture.agencyId, p_name: `Département ${label}`, p_active: true, p_revision: null });
  return { siteId, departmentId };
}

/** HR file + employee login linked to the same employees row, like a payroll-activated account. */
export async function createHrEmployeeLogin(fixture: HrE2EFixture, label: string, input: { siteId: string; departmentId: string }) {
  const email = `codex-${label}-${fixture.suffix}@example.com`;
  fixture.createdEmails.push(email);
  const employeeId = await hrRpc<string>(fixture, "hr_create_employee", {
    p_actor_id: fixture.hr.id, p_agency_id: fixture.agencyId, p_matricule: `${label.toUpperCase()}-${fixture.suffix.slice(-5)}`, p_email: email, p_full_name: `Salarié ${label}`,
    p_job_title: "Agent", p_department_id: input.departmentId, p_site_id: input.siteId, p_team_id: null, p_manager_profile_id: null,
    p_status: "ACTIVE", p_contract_type: "MISSION", p_contract_start: "2026-01-05", p_contract_end: null,
  });
  const { data: user, error } = await fixture.admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true });
  if (error || !user.user) throw new Error(`Unable to create ${label}: ${error?.message}`);
  const { data: profile, error: profileError } = await fixture.admin.from("profiles").insert({ auth_user_id: user.user.id, email, full_name: `Salarié ${label}`, role: "employee" }).select("id").single();
  if (profileError || !profile) throw new Error(`Unable to create ${label} profile: ${profileError?.message}`);
  await fixture.admin.from("employees").update({ profile_id: profile.id }).eq("id", employeeId);
  return { email, employeeId, fullName: `Salarié ${label}` };
}

/** Team manager or client viewer with a password login, scoped in the fixture agency. */
export async function createHrScopedUser(fixture: HrE2EFixture, role: "team_manager" | "client_viewer", label: string, scope: Record<string, string>) {
  const email = `codex-${label}-${fixture.suffix}@example.com`;
  fixture.createdEmails.push(email);
  const { data, error } = await fixture.admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true });
  if (error || !data.user) throw new Error(`Unable to create ${label}: ${error?.message}`);
  const id = await hrRpc<string>(fixture, "admin_save_hr_access", {
    p_actor_id: fixture.superAdmin.id, p_profile_id: null, p_auth_user_id: data.user.id, p_email: email, p_name: `Codex ${label}`,
    p_role: role, p_active: true, p_scopes: [{ agency_id: fixture.agencyId, ...scope }], p_expected_updated_at: null,
  });
  return { email, id, fullName: `Codex ${label}` };
}

/** Same local placeholder as playwright.config.ts (never a production value). */
export const E2E_CRON_BEARER = `Bearer ${process.env.CRON_SECRET ?? ["local", "e2e", "cron", "bearer", "placeholder", "0001"].join("-")}`;
