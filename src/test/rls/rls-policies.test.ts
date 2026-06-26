import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rlsMigrationSql = readFileSync("supabase/migrations/202606260002_rls_policies.sql", "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

const coreSchemaSql = readFileSync("supabase/migrations/202606260001_core_schema.sql", "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

const reportingViewsPath = "supabase/migrations/202606260003_reporting_views.sql";
const reportingViewsSql = existsSync(reportingViewsPath)
  ? readFileSync(reportingViewsPath, "utf8").replace(/\s+/g, " ").toLowerCase()
  : "";

const authenticatedGrantStatements = rlsMigrationSql.match(/grant\s+[^;]+to\s+authenticated;/g) ?? [];
const payslipVersionsTableSql = coreSchemaSql.match(
  /create table public\.payslip_versions \((.*?)\); alter table public\.payslips/s,
)?.[1] ?? "";
const roleHelperNames = [
  "current_profile_id",
  "current_app_role",
  "current_agency_id",
  "is_global_reader",
] as const;
const publicRoleHelperCallPattern = /\bpublic\.(current_profile_id|current_app_role|current_agency_id|is_global_reader)\s*\(/;

type PolicyCase = {
  actorRole: string;
  resourceAgencyId: string;
  actorAgencyId?: string;
  employeeAgencyId?: string;
  importAgencyId?: string;
  versionAgencyId?: string;
  payslipId?: string;
  versionPayslipId?: string;
  ownerProfileId?: string;
  actorProfileId: string;
  isCurrentPublished?: boolean;
};

function canSelectProfile(input: Pick<PolicyCase, "actorRole" | "actorProfileId" | "ownerProfileId">): boolean {
  return (
    input.actorProfileId === input.ownerProfileId
    || input.actorRole === "hr_central"
    || input.actorRole === "super_admin"
  );
}

function canSelectEmployeeOwnedBranch(input: Pick<PolicyCase, "actorRole" | "actorProfileId" | "ownerProfileId">): boolean {
  return input.actorRole === "employee" && input.actorProfileId === input.ownerProfileId;
}

function canSelectEmployeeRecord(input: PolicyCase): boolean {
  return (
    input.actorRole === "hr_central"
    || input.actorRole === "super_admin"
    || (
      input.actorRole === "agency_manager"
      && input.actorAgencyId === input.resourceAgencyId
    )
    || canSelectEmployeeOwnedBranch(input)
  );
}

function canSelectPayslip(input: PolicyCase): boolean {
  if (input.actorRole === "hr_central" || input.actorRole === "super_admin") return true;
  if (input.actorRole === "agency_manager") {
    return input.actorAgencyId === input.resourceAgencyId;
  }
  if (input.actorRole === "employee") {
    return input.actorProfileId === input.ownerProfileId && input.isCurrentPublished === true;
  }

  return false;
}

function canSelectAgencyScopedResource(input: PolicyCase): boolean {
  return (
    input.actorRole === "hr_central"
    || input.actorRole === "super_admin"
    || (
      input.actorRole === "agency_manager"
      && input.actorAgencyId === input.resourceAgencyId
    )
  );
}

function canPublish(input: PolicyCase): boolean {
  return (
    input.actorRole === "agency_manager"
    && input.actorAgencyId === input.resourceAgencyId
    && input.employeeAgencyId !== undefined
    && input.employeeAgencyId === input.resourceAgencyId
  );
}

function canUpdatePayslip(_input: PolicyCase): boolean {
  return false;
}

function canCreatePayslipVersion(input: PolicyCase): boolean {
  return (
    input.actorRole === "agency_manager"
    && input.actorAgencyId === input.resourceAgencyId
    && input.versionAgencyId === input.resourceAgencyId
    && input.importAgencyId !== undefined
    && input.importAgencyId === input.versionAgencyId
  );
}

function canSetCurrentPayslipVersion(input: PolicyCase): boolean {
  return input.versionPayslipId !== undefined && input.payslipId === input.versionPayslipId;
}

function canCreateImportRow(input: PolicyCase): boolean {
  return (
    input.actorRole === "agency_manager"
    && input.actorAgencyId === input.resourceAgencyId
    && input.importAgencyId !== undefined
    && input.importAgencyId === input.resourceAgencyId
  );
}

function canReadAuditLogs(actorRole: string): boolean {
  return actorRole === "hr_central" || actorRole === "super_admin";
}

function canReadPayrollAnalytics(actorRole: string): boolean {
  return actorRole === "hr_central" || actorRole === "super_admin";
}

describe("RLS policy model", () => {
  it("revokes Supabase default table privileges before narrow authenticated grants", () => {
    expect(rlsMigrationSql).toContain(
      "revoke all privileges on all tables in schema public from anon, authenticated;",
    );
    expect(rlsMigrationSql).toContain(
      "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;",
    );
  });

  it("keeps authenticated grants narrow for employee and payslip tables", () => {
    expect(rlsMigrationSql).toContain("grant select, insert on table public.employees to authenticated;");
    expect(rlsMigrationSql).toContain("grant select, insert on table public.payslips to authenticated;");
    expect(rlsMigrationSql).toContain("grant select, insert on table public.payslip_versions to authenticated;");

    const reviewedTableGrantStatements = authenticatedGrantStatements.filter((statement) =>
      /\bpublic\.(employees|payslips|payslip_versions)\b/.test(statement),
    );

    expect(reviewedTableGrantStatements).toHaveLength(3);
    expect(reviewedTableGrantStatements).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\b(update|delete|truncate|trigger|references)\b/),
      ]),
    );
  });

  it("keeps RLS role helpers private security definer functions with scoped execute grants", () => {
    expect(rlsMigrationSql).toContain("create schema if not exists private;");
    expect(rlsMigrationSql).toContain("revoke all on schema private from public;");
    expect(rlsMigrationSql).toContain("grant usage on schema private to authenticated, service_role;");

    const expectedReturns = {
      current_profile_id: "uuid",
      current_app_role: "public.app_role",
      current_agency_id: "uuid",
      is_global_reader: "boolean",
    } satisfies Record<(typeof roleHelperNames)[number], string>;

    for (const helperName of roleHelperNames) {
      expect(rlsMigrationSql).not.toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${helperName}\\s*\\(`),
      );
      expect(rlsMigrationSql).toMatch(
        new RegExp(
          `create\\s+or\\s+replace\\s+function\\s+private\\.${helperName}\\s*\\(\\)\\s+returns\\s+${expectedReturns[helperName]}\\s+language\\s+sql\\s+stable\\s+security\\s+definer\\s+set\\s+search_path\\s*=\\s*pg_catalog\\s+as\\s+\\$\\$`,
        ),
      );
      expect(rlsMigrationSql).toContain(`revoke execute on function private.${helperName}() from public;`);
      expect(rlsMigrationSql).toContain(
        `grant execute on function private.${helperName}() to authenticated, service_role;`,
      );
      expect(rlsMigrationSql).not.toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+private\\.${helperName}\\s*\\(\\)\\s+to\\s+(public|anon)\\b`),
      );
    }
  });

  it("routes RLS policies and reporting views through private helpers", () => {
    expect(rlsMigrationSql).toContain(
      "or ( private.current_app_role() = 'employee' and profile_id = private.current_profile_id() )",
    );
    expect(rlsMigrationSql).not.toMatch(publicRoleHelperCallPattern);
    expect(reportingViewsSql).toContain("where private.is_global_reader()");
    expect(reportingViewsSql).not.toMatch(publicRoleHelperCallPattern);
  });

  it("does not use auth metadata claims as an authorization source", () => {
    const authorizationSql = `${rlsMigrationSql} ${reportingViewsSql}`;

    expect(authorizationSql).not.toMatch(/\b(user_metadata|raw_user_meta_data|raw_app_meta_data)\b/);
  });

  it("requires employee role on employee-owned SQL read branches", () => {
    expect(rlsMigrationSql).toContain(
      "or ( private.current_app_role() = 'employee' and profile_id = private.current_profile_id() )",
    );
    expect(rlsMigrationSql).toContain(
      "or ( private.current_app_role() = 'employee' and current_version_id is not null",
    );
    expect(rlsMigrationSql).toContain(
      "or ( private.current_app_role() = 'employee' and p.current_version_id = payslip_versions.id",
    );
  });

  it("schema-constrains payslip versions to one agency across payslip and import", () => {
    expect(coreSchemaSql).toContain("constraint payslips_id_agency_id_key unique (id, agency_id)");
    expect(coreSchemaSql).toContain("agency_id uuid not null");
    expect(coreSchemaSql).toContain(
      "constraint payslip_versions_payslip_agency_fk foreign key (payslip_id, agency_id) references public.payslips(id, agency_id) on delete cascade",
    );
    expect(coreSchemaSql).toContain(
      "constraint payslip_versions_import_agency_fk foreign key (import_id, agency_id) references public.payroll_imports(id, agency_id)",
    );
    expect(payslipVersionsTableSql).not.toContain("import_id uuid not null references public.payroll_imports(id)");
  });

  it("allows global readers to read profiles", () => {
    expect(
      canSelectProfile({
        actorRole: "hr_central",
        actorProfileId: "profile_hr",
        ownerProfileId: "profile_employee_a",
      }),
    ).toBe(true);

    expect(
      canSelectProfile({
        actorRole: "super_admin",
        actorProfileId: "profile_admin",
        ownerProfileId: "profile_employee_a",
      }),
    ).toBe(true);
  });

  it("denies employee access to another employee payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_b",
        resourceAgencyId: "agency_1",
        isCurrentPublished: true,
      }),
    ).toBe(false);
  });

  it("allows employee access to own currently published payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_a",
        resourceAgencyId: "agency_1",
        isCurrentPublished: true,
      }),
    ).toBe(true);
  });

  it("denies employee access to own replaced payslip version", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_a",
        resourceAgencyId: "agency_1",
        isCurrentPublished: false,
      }),
    ).toBe(false);
  });

  it("requires agency manager role plus matching agency for agency-wide reads", () => {
    expect(
      canSelectAgencyScopedResource({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(true);

    expect(
      canSelectAgencyScopedResource({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_2",
      }),
    ).toBe(false);
  });

  it("denies employee agency-wide reads even with matching agency-like membership", () => {
    expect(
      canSelectAgencyScopedResource({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("denies manager publication outside assigned agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        employeeAgencyId: "agency_1",
        resourceAgencyId: "agency_2",
      }),
    ).toBe(false);
  });

  it("allows manager publication inside assigned agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        employeeAgencyId: "agency_1",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(true);
  });

  it("denies manager publication when employee agency differs from payslip agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        employeeAgencyId: "agency_2",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("denies HR central publication", () => {
    expect(
      canPublish({
        actorRole: "hr_central",
        actorProfileId: "profile_hr",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("denies direct payslip updates by managers", () => {
    expect(
      canUpdatePayslip({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("denies manager payslip version creation from another agency import", () => {
    expect(
      canCreatePayslipVersion({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        importAgencyId: "agency_2",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("requires current payslip version to belong to the payslip", () => {
    expect(
      canSetCurrentPayslipVersion({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        payslipId: "payslip_a",
        resourceAgencyId: "agency_1",
        versionPayslipId: "payslip_b",
      }),
    ).toBe(false);
  });

  it("requires import rows to belong to an import in the same agency", () => {
    expect(
      canCreateImportRow({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        importAgencyId: "agency_2",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("restricts audit log reads to global readers", () => {
    expect(canReadAuditLogs("hr_central")).toBe(true);
    expect(canReadAuditLogs("super_admin")).toBe(true);
    expect(canReadAuditLogs("agency_manager")).toBe(false);
    expect(canReadAuditLogs("employee")).toBe(false);
  });

  it("keeps payroll analytics view behind global-reader filtering and explicit grants", () => {
    expect(reportingViewsSql).toContain(
      "create view public.payroll_analytics_rows with (security_invoker = true)",
    );
    expect(reportingViewsSql).toContain("where private.is_global_reader()");
    expect(reportingViewsSql).toContain(
      "revoke all on table public.payroll_analytics_rows from public, anon, authenticated;",
    );
    expect(reportingViewsSql).toContain(
      "grant select on table public.payroll_analytics_rows to authenticated, service_role;",
    );
    expect(reportingViewsSql).not.toMatch(
      /grant\s+select\s+on\s+table\s+public\.payroll_analytics_rows\s+to\s+anon\b/,
    );

    expect(canReadPayrollAnalytics("hr_central")).toBe(true);
    expect(canReadPayrollAnalytics("super_admin")).toBe(true);
    expect(canReadPayrollAnalytics("agency_manager")).toBe(false);
    expect(canReadPayrollAnalytics("employee")).toBe(false);
  });

  it("denies non-employee roles the employee-owned branch even when profile-linked", () => {
    expect(
      canSelectEmployeeOwnedBranch({
        actorRole: "agency_manager",
        actorProfileId: "profile_linked",
        ownerProfileId: "profile_linked",
      }),
    ).toBe(false);

    expect(
      canSelectEmployeeOwnedBranch({
        actorRole: "hr_central",
        actorProfileId: "profile_linked",
        ownerProfileId: "profile_linked",
      }),
    ).toBe(false);

    expect(
      canSelectEmployeeOwnedBranch({
        actorRole: "employee",
        actorProfileId: "profile_linked",
        ownerProfileId: "profile_linked",
      }),
    ).toBe(true);
  });

  it("denies a linked agency manager outside their agency through employee-owned employee access", () => {
    expect(
      canSelectEmployeeRecord({
        actorRole: "agency_manager",
        actorProfileId: "profile_linked_manager",
        actorAgencyId: "agency_1",
        ownerProfileId: "profile_linked_manager",
        resourceAgencyId: "agency_2",
      }),
    ).toBe(false);
  });
});
