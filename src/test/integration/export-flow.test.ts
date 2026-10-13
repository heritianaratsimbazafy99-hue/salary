import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/exports/route";
import { canCreateExport } from "@/lib/payroll/export";
import type { AppRole } from "@/lib/roles";

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_AGENCY_ID = "00000000-0000-0000-0000-000000000202";
const ACTOR_PROFILE_ID = "00000000-0000-0000-0000-000000000301";
const ACTOR_AUTH_USER_ID = "00000000-0000-0000-0000-000000000401";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const adminMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: adminMocks.createAdminClient,
}));

vi.mock("@/lib/audit/server", () => ({
  recordAuditEvent: auditMocks.recordAuditEvent,
}));

type ExportTableRow = Record<string, unknown>;

type ExportTestDb = {
  agency_memberships: ExportTableRow[];
  export_jobs: ExportTableRow[];
  payroll_analytics_rows: ExportTableRow[];
  payroll_imports: ExportTableRow[];
  profiles: ExportTableRow[];
  payslips: ExportTableRow[];
};

function createExportDb(): ExportTestDb {
  return {
    agency_memberships: [],
    export_jobs: [],
    payroll_analytics_rows: [],
    payroll_imports: [],
    profiles: [],
    payslips: [],
  };
}

function createSupabaseClient(options: {
  db: ExportTestDb;
  authUserId?: string | null;
  actorRole?: AppRole;
  actorAgencyId?: string | null;
}) {
  const authUserId = "authUserId" in options ? options.authUserId : ACTOR_AUTH_USER_ID;

  if (authUserId && options.actorRole) {
    options.db.profiles.push({
      auth_user_id: authUserId,
      id: ACTOR_PROFILE_ID,
      role: options.actorRole,
    });

    if (options.actorAgencyId) {
      options.db.agency_memberships.push({
        agency_id: options.actorAgencyId,
        profile_id: ACTOR_PROFILE_ID,
      });
    }
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authUserId ? { id: authUserId } : null },
        error: null,
      })),
    },
    from: vi.fn((table: keyof ExportTestDb) => createTableQuery(options.db[table])),
  };
}

function createTableQuery(rows: ExportTableRow[]) {
  const filters: Array<(row: ExportTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    select() {
      return query;
    },
    order() { return query; },
    gte(column: string, value: string) { filters.push((row) => String(row[column]) >= value); return query; },
    lte(column: string, value: string) { filters.push((row) => String(row[column]) <= value); return query; },
    not(column: string, operator: string, value: unknown) { filters.push((row) => row[column] !== value); return query; },
    range(start: number, end: number) { return Promise.resolve({ data: filteredRows().slice(start, end + 1), error: null }); },
    limit(count: number) { return Promise.resolve({ data: filteredRows().slice(0, count), error: null }); },
    insert(payload: ExportTableRow | ExportTableRow[]) {
      const payloadRows = Array.isArray(payload) ? payload : [payload];
      const insertedRows = payloadRows.map((row, index) => ({
        ...row,
        id: row.id ?? `00000000-0000-0000-0000-80000000000${rows.length + index + 1}`,
      }));

      rows.push(...insertedRows);

      return createMutationResult(insertedRows);
    },
    single: async () => {
      const row = filteredRows()[0];

      return {
        data: row ?? null,
        error: row ? null : { code: "PGRST116", message: "No rows" },
      };
    },
  };

  function filteredRows() {
    return rows.filter((candidate) => filters.every((filter) => filter(candidate)));
  }

  return query;
}

function createMutationResult(rows: ExportTableRow[]) {
  const result = Promise.resolve({ data: null, error: null });

  return {
    select() {
      return {
        single: async () => ({ data: rows[0] ?? null, error: null }),
      };
    },
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
  };
}

function mockExportClient(options: {
  actorAgencyId?: string | null;
  actorRole?: AppRole;
  authUserId?: string | null;
} = {}) {
  const db = createExportDb();
  const client = createSupabaseClient({
    actorAgencyId: options.actorAgencyId,
    actorRole: options.actorRole,
    authUserId: "authUserId" in options ? options.authUserId : ACTOR_AUTH_USER_ID,
    db,
  });

  supabaseMocks.createClient.mockResolvedValue(client);
  return { client, db };
}

function mockAdminExportClient(db: ExportTestDb) {
  const client = createSupabaseClient({ authUserId: null, db });
  adminMocks.createAdminClient.mockReturnValue(client);
  return client;
}

function createExportRequest(body: unknown) {
  return {
    json: vi.fn(async () => body),
  } as unknown as NextRequest;
}

function createMalformedJsonRequest() {
  return {
    json: vi.fn(async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    }),
  } as unknown as NextRequest;
}

describe("canCreateExport", () => {
  const cases = [
    {
      name: "allows hr central import report exports",
      input: { role: "hr_central", exportType: "IMPORT_REPORT" },
      expected: true,
    },
    {
      name: "allows hr central published payslip exports",
      input: { role: "hr_central", exportType: "PUBLISHED_PAYSLIPS" },
      expected: true,
    },
    {
      name: "allows super admin import report exports",
      input: { role: "super_admin", exportType: "IMPORT_REPORT" },
      expected: true,
    },
    {
      name: "allows super admin published payslip exports",
      input: { role: "super_admin", exportType: "PUBLISHED_PAYSLIPS" },
      expected: true,
    },
    {
      name: "allows agency manager import report exports for own agency",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      },
      expected: true,
    },
    {
      name: "denies agency manager published payslip exports for own agency",
      input: {
        role: "agency_manager",
        exportType: "PUBLISHED_PAYSLIPS",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager cross-agency import report exports",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-2",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when actor agency is missing",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when actor agency is null",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: null,
        requestedAgencyId: "agency-1",
      },
      expected: false,
    },
    {
      name: "denies agency manager import report exports when agency ids are empty",
      input: {
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "",
        requestedAgencyId: "",
      },
      expected: false,
    },
    {
      name: "denies employee import report exports",
      input: { role: "employee", exportType: "IMPORT_REPORT" },
      expected: false,
    },
    {
      name: "denies employee published payslip exports",
      input: { role: "employee", exportType: "PUBLISHED_PAYSLIPS" },
      expected: false,
    },
  ] as const;

  it.each(cases)("$name", ({ input, expected }) => {
    expect(canCreateExport(input)).toBe(expected);
  });
});

describe("POST /api/exports", () => {
  beforeEach(() => {
    adminMocks.createAdminClient.mockReset();
    auditMocks.recordAuditEvent.mockReset();
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    mockExportClient({ authUserId: null });

    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 422 and VALIDATION_ERROR for invalid export types", async () => {
    mockExportClient();

    const response = await POST(createExportRequest({ exportType: "PAYROLL_ROWS" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "not-a-uuid", 42] as const)(
    "returns 422 and VALIDATION_ERROR for invalid agency ids: %j",
    async (agencyId) => {
      mockExportClient({ actorRole: "hr_central" });

      const response = await POST(createExportRequest({ agencyId, exportType: "IMPORT_REPORT" }));

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
      expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("returns 422 and VALIDATION_ERROR for malformed JSON", async () => {
    mockExportClient();

    const response = await POST(createMalformedJsonRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      actorRole: "employee",
      body: { agencyId: AGENCY_ID, exportType: "IMPORT_REPORT" },
      name: "employee import report export",
    },
    {
      actorAgencyId: OTHER_AGENCY_ID,
      actorRole: "agency_manager",
      body: { agencyId: AGENCY_ID, exportType: "IMPORT_REPORT" },
      name: "agency manager cross-agency import report export",
    },
  ] as const)("returns 403 and FORBIDDEN for $name", async ({ actorAgencyId, actorRole, body }) => {
    mockExportClient({ actorAgencyId, actorRole });

    const response = await POST(createExportRequest(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("neutralizes formula-leading values in import report CSV exports", async () => {
    const { client, db } = mockExportClient({ actorRole: "hr_central" });
    db.payroll_imports.push({
      agency_id: AGENCY_ID,
      created_at: "2026-06-27T10:00:00.000Z",
      id: "import-001",
      invalid_row_count: 1,
      period_end: "2026-06-30",
      period_start: "2026-06-01",
      source_filename: '=HYPERLINK("https://example.test","Open")',
      status: "COMPLETED",
      unknown_employee_count: 0,
      valid_row_count: 10,
    });
    const adminClient = mockAdminExportClient(db);

    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT" }));

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("\n=HYPERLINK");
    expect(csv).not.toContain(",=HYPERLINK");
    expect(client.from).toHaveBeenCalledWith("payroll_imports");
    expect(adminClient.from).toHaveBeenCalledWith("export_jobs");
  });

  it("returns CSV content, persists a completed export job, and audits authorized requests", async () => {
    const { client, db } = mockExportClient({ actorRole: "hr_central" });
    db.payroll_analytics_rows.push({
      agency_id: AGENCY_ID,
      agency_name: "Agence Antananarivo",
      deductions_total: 100000,
      employee_id: "EMP-001",
      employee_name: '=HYPERLINK("https://example.test","Employee")',
      gross_amount: 1200000,
      net_amount: 1100000,
      period_end: "2026-06-30",
      period_start: "2026-06-01",
      published_at: "2026-06-27T10:00:00.000Z",
    });
    const adminClient = mockAdminExportClient(db);

    const response = await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("x-export-job-id")).toBe("00000000-0000-0000-0000-800000000001");
    expect(response.headers.get("x-export-status")).toBe("COMPLETED");
    const csv = await response.text();
    expect(csv).toContain(
      "agency_id,agency_name,employee_id,employee_name,period_start,period_end,gross_amount,deductions_total,net_amount,published_at",
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("\n=HYPERLINK");
    expect(csv).not.toContain(",=HYPERLINK");
    expect(adminMocks.createAdminClient).toHaveBeenCalledOnce();
    expect(client.from).toHaveBeenCalledWith("payroll_analytics_rows");
    expect(adminClient.from).toHaveBeenCalledWith("export_jobs");
    expect(db.export_jobs).toEqual([
      expect.objectContaining({
        agency_id: null,
        export_type: "PUBLISHED_PAYSLIPS",
        requested_by: ACTOR_PROFILE_ID,
        status: "COMPLETED",
      }),
    ]);
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYROLL_EXPORT_REQUESTED",
        actorProfileId: ACTOR_PROFILE_ID,
        actorRole: "hr_central",
        agencyId: null,
        metadata: {
          agencyId: null,
          exportJobId: "00000000-0000-0000-0000-800000000001",
          exportType: "PUBLISHED_PAYSLIPS",
          status: "COMPLETED",
          format: "csv",
          rowCount: 1,
          importId: undefined,
          periodStart: undefined,
          periodEnd: undefined,
        },
        resourceId: "00000000-0000-0000-0000-800000000001",
        resourceType: "export_job",
      }),
    );
  });
  it.each([
    { format: "exe" }, { periodStart: "2026-02-30" },
    { periodStart: "2026-07-01", periodEnd: "2026-06-01" },
    { importId: "not-an-id" }, { format: "pdf", exportType: "IMPORT_REPORT" },
  ])("rejects invalid formats or filters %j", async (extra) => {
    mockExportClient({ actorRole: "hr_central" });
    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT", ...extra }));
    expect(response.status).toBe(422);
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["csv", "xlsx", "pdf"])("denies manager published exports in %s", async (format) => {
    mockExportClient({ actorRole: "agency_manager", actorAgencyId: AGENCY_ID });
    expect((await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS", agencyId: AGENCY_ID, format }))).status).toBe(403);
  });

  it("filters own-agency reports by import and period and returns XLSX", async () => {
    const { db } = mockExportClient({ actorRole: "agency_manager", actorAgencyId: AGENCY_ID });
    mockAdminExportClient(db);
    const row = { agency_id: AGENCY_ID, id: "00000000-0000-0000-0000-000000000777", created_at: "2026-06-30", period_start: "2026-06-01", period_end: "2026-06-30", status: "COMPLETED", source_filename: "own.xlsx", valid_row_count: 1, invalid_row_count: 0, unknown_employee_count: 0 };
    db.payroll_imports.push(row, { ...row, agency_id: OTHER_AGENCY_ID, source_filename: "secret.xlsx" });
    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT", agencyId: AGENCY_ID, importId: row.id, format: "xlsx", periodStart: "2026-06-01", periodEnd: "2026-06-30" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ rowCount: 1, format: "xlsx", importId: row.id }) }));
    expect(db.export_jobs[0].period_start).toBe("2026-06-01");
  });

  it("refuses to deliver an export when audit recording fails", async () => {
    const { db } = mockExportClient({ actorRole: "hr_central" });
    mockAdminExportClient(db);
    auditMocks.recordAuditEvent.mockRejectedValueOnce(new Error("audit failed"));
    expect((await POST(createExportRequest({ exportType: "IMPORT_REPORT" }))).status).toBe(500);
  });

  it("does not silently truncate more than 5000 rows", async () => {
    const { db } = mockExportClient({ actorRole: "hr_central" });
    db.payroll_imports.push(...Array.from({ length: 5001 }, (_, index) => ({ id: String(index) })));
    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT" }));
    expect(response.status).toBe(422);
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("renders HR PDFs from published versions and audits format", async () => {
    const { db } = mockExportClient({ actorRole: "hr_central" });
    mockAdminExportClient(db);
    db.payslips.push({ id: "fiche-1", agency_id: AGENCY_ID, period_start: "2026-06-01", period_end: "2026-06-30", published_at: "2026-06-30", current_version_id: "version-1", employee: { full_name: "Élodie" }, current_version: { snapshot_data: { grossAmount: 100, deductionsTotal: 20, netAmount: 80 }, pay_items: [] } });
    const response = await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS", format: "pdf", agencyId: AGENCY_ID }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect((await response.text()).startsWith("%PDF-")).toBe(true);
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ format: "pdf", rowCount: 1 }) }));
  });

  it("fails rather than exporting a missing numeric value as zero", async () => {
    const { db } = mockExportClient({ actorRole: "hr_central" });
    db.payroll_analytics_rows.push({ agency_id: AGENCY_ID, agency_name: "Agence", employee_id: "EMP01", employee_name: "Salarié", period_start: "2026-06-01", period_end: "2026-06-30", published_at: "2026-06-30", gross_amount: "", deductions_total: 10, net_amount: 20 });
    expect((await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS" }))).status).toBe(500);
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns an explicit error for no published PDFs", async () => {
    mockExportClient({ actorRole: "hr_central" });
    const response = await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS", format: "pdf" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { message: "Aucune fiche publiée dans cette sélection." } });
  });

  it("rejects PDF batches over 100 before rendering", async () => {
    const { db } = mockExportClient({ actorRole: "hr_central" });
    db.payslips.push(...Array.from({ length: 101 }, (_, index) => ({ id: String(index), current_version_id: "version" })));
    expect((await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS", format: "pdf" }))).status).toBe(422);
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

});
