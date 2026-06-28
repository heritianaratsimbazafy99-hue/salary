import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/imports/route";
import { buildImportSummary } from "@/lib/payroll/import-service";
import type { AppRole } from "@/lib/roles";

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_AGENCY_ID = "00000000-0000-0000-0000-000000000202";
const ACTOR_PROFILE_ID = "00000000-0000-0000-0000-000000000301";
const ACTOR_AUTH_USER_ID = "00000000-0000-0000-0000-000000000401";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const supabaseAdminMocks = vi.hoisted(() => ({
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
  createAdminClient: supabaseAdminMocks.createAdminClient,
}));

vi.mock("@/lib/audit/server", () => ({
  recordAuditEvent: auditMocks.recordAuditEvent,
}));

type ImportTableRow = Record<string, unknown>;

type ImportTestDb = {
  profiles: ImportTableRow[];
  agency_memberships: ImportTableRow[];
  column_mappings: ImportTableRow[];
  employees: ImportTableRow[];
  payroll_imports: ImportTableRow[];
  payroll_import_rows: ImportTableRow[];
  payroll_import_errors: ImportTableRow[];
};

function createImportDb(): ImportTestDb {
  return {
    agency_memberships: [],
    column_mappings: [],
    employees: [],
    payroll_import_errors: [],
    payroll_import_rows: [],
    payroll_imports: [],
    profiles: [],
  };
}

function createSupabaseClient(options: {
  db: ImportTestDb;
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
      getClaims: vi.fn(async () => ({
        data: { claims: authUserId ? { sub: authUserId } : {} },
        error: null,
      })),
      getUser: vi.fn(async () => ({
        data: { user: authUserId ? { id: authUserId } : null },
        error: null,
      })),
    },
    from: vi.fn((table: keyof ImportTestDb) => createTableQuery(options.db, table)),
  };
}

function createTableQuery(db: ImportTestDb, table: keyof ImportTestDb) {
  return {
    insert(payload: ImportTableRow | ImportTableRow[]) {
      const payloadRows = Array.isArray(payload) ? payload : [payload];
      const insertedRows = payloadRows.map((row, index) => ({
        ...row,
        id: row.id ?? generatedIdFor(table, db[table].length + index + 1),
      }));

      db[table].push(...insertedRows);

      return createMutationResult(insertedRows);
    },
    select() {
      return createSelectQuery(db[table]);
    },
  };
}

function createMutationResult(insertedRows: ImportTableRow[]) {
  const result = Promise.resolve({ data: null, error: null });

  return {
    select() {
      return {
        single: async () => ({ data: insertedRows[0] ?? null, error: null }),
      };
    },
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
  };
}

function createSelectQuery(rows: ImportTableRow[]) {
  const filters: Array<(row: ImportTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    maybeSingle: async () => ({ data: filteredRows()[0] ?? null, error: null }),
    single: async () => {
      const row = filteredRows()[0];
      return {
        data: row ?? null,
        error: row ? null : { code: "PGRST116", message: "No rows" },
      };
    },
    then(resolve: (value: { data: ImportTableRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: filteredRows(), error: null }).then(resolve, reject);
    },
  };

  function filteredRows() {
    return rows.filter((row) => filters.every((filter) => filter(row)));
  }

  return query;
}

function generatedIdFor(table: keyof ImportTestDb, index: number) {
  if (table === "payroll_imports") return `00000000-0000-0000-0000-10000000000${index}`;
  if (table === "payroll_import_rows") return `00000000-0000-0000-0000-20000000000${index}`;
  if (table === "payroll_import_errors") return `00000000-0000-0000-0000-30000000000${index}`;
  return `00000000-0000-0000-0000-90000000000${index}`;
}

function createImportRequest(formData: FormData, headers = createMultipartHeaders(formData)) {
  return {
    formData: vi.fn(async () => formData),
    headers,
  } as unknown as NextRequest;
}

function createMultipartHeaders(formData: FormData) {
  return new Headers({
    "content-length": String(estimateMultipartContentLength(formData)),
    "content-type": "multipart/form-data; boundary=import-flow-test",
  });
}

function estimateMultipartContentLength(formData: FormData) {
  let contentLength = 1024;

  for (const value of formData.values()) {
    contentLength += value instanceof File ? value.size : value.length;
  }

  return contentLength;
}

function createAuthorizedImportClient(options: {
  actorRole?: AppRole;
  actorAgencyId?: string | null;
  db?: ImportTestDb;
  authUserId?: string | null;
} = {}) {
  const db = options.db ?? createImportDb();
  const client = createSupabaseClient({
    actorAgencyId: options.actorAgencyId ?? AGENCY_ID,
    actorRole: options.actorRole ?? "agency_manager",
    authUserId: "authUserId" in options ? options.authUserId : ACTOR_AUTH_USER_ID,
    db,
  });
  supabaseMocks.createClient.mockResolvedValue(client);
  supabaseAdminMocks.createAdminClient.mockReturnValue(
    createSupabaseClient({
      authUserId: null,
      db,
    }),
  );
  return { client, db };
}

async function createPayrollFile(rows: Array<Record<string, unknown>>, filename = "payroll.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("payroll");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  worksheet.addRow(headers);
  rows.forEach((row) => {
    worksheet.addRow(headers.map((header) => row[header] ?? null));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer as BlobPart], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function appendRequiredImportFields(formData: FormData, file: File) {
  formData.set("agencyId", AGENCY_ID);
  formData.set("periodStart", "2026-06-01");
  formData.set("periodEnd", "2026-06-30");
  formData.set("file", file);
}

const validPayrollRow = {
  deductions_total: 100000,
  email: "employee@example.com",
  employee_id: "EMP-001",
  employee_name: "Employee One",
  gross_amount: 1200000,
  net_amount: 1100000,
  period_end: "2026-06-30",
  period_start: "2026-06-01",
};

describe("buildImportSummary", () => {
  it("summarizes mixed valid and invalid import results", () => {
    const summary = buildImportSummary({
      invalidRows: [{ rowNumber: 4 }],
      unknownEmployeeIds: ["EMP-002"],
      validRows: [{ employeeId: "EMP-001" }, { employeeId: "EMP-002" }],
    });

    expect(summary).toEqual({
      invalidRowCount: 1,
      unknownEmployeeCount: 1,
      validRowCount: 2,
    });
  });
});

describe("POST /api/imports", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
    supabaseAdminMocks.createAdminClient.mockReset();
    auditMocks.recordAuditEvent.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    createAuthorizedImportClient({ authUserId: null });

    const response = await POST(createImportRequest(new FormData()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it.each(["employee", "hr_central"] as const)(
    "returns 403 and does not persist when the authenticated actor is %s",
    async (actorRole) => {
      const { db } = createAuthorizedImportClient({ actorRole });
      const formData = new FormData();
      appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));

      const response = await POST(createImportRequest(formData));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "FORBIDDEN" },
      });
      expect(db.payroll_imports).toHaveLength(0);
      expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("returns 403 and does not persist when a manager imports for another agency", async () => {
    const { db } = createAuthorizedImportClient({ actorAgencyId: OTHER_AGENCY_ID });
    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(db.payroll_imports).toHaveLength(0);
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 422 and VALIDATION_ERROR when an authenticated request is missing a file", async () => {
    createAuthorizedImportClient();

    const formData = new FormData();
    formData.set("agencyId", AGENCY_ID);
    formData.set("periodStart", "2026-06-01");
    formData.set("periodEnd", "2026-06-30");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 when an authenticated request uploads a file larger than 10 MB", async () => {
    createAuthorizedImportClient();

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "payroll.xlsx"),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 422 and does not persist or audit when the uploaded file is not Excel", async () => {
    const { db } = createAuthorizedImportClient();
    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      new File(["employee_id,email\nEMP-001,employee@example.com"], "payroll.txt", {
        type: "text/plain",
      }),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(db.payroll_imports).toHaveLength(0);
    expect(db.payroll_import_rows).toHaveLength(0);
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 422 without parsing form data when content-length exceeds the upload limit and multipart overhead", async () => {
    createAuthorizedImportClient();

    const request = createImportRequest(
      new FormData(),
      new Headers({ "content-length": String(10 * 1024 * 1024 + 64 * 1024 + 1) }),
    );

    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("rejects missing content length before parsing multipart bodies", async () => {
    createAuthorizedImportClient();

    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));
    const request = createImportRequest(formData, new Headers());

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("rejects nonnumeric content length before parsing multipart bodies", async () => {
    createAuthorizedImportClient();

    const headers = new Headers({ "content-length": "not-a-number" });
    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));
    const request = createImportRequest(formData, headers);

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("rejects negative content length before parsing multipart bodies", async () => {
    createAuthorizedImportClient();

    const headers = new Headers({
      "content-length": "-1",
      "content-type": "multipart/form-data; boundary=import-flow-test",
    });
    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));
    const request = createImportRequest(formData, headers);

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("rejects non-decimal content length before parsing multipart bodies", async () => {
    createAuthorizedImportClient();

    const headers = new Headers({
      "content-length": "1e3",
      "content-type": "multipart/form-data; boundary=import-flow-test",
    });
    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));
    const request = createImportRequest(formData, headers);

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("rejects multipart content type without a boundary before parsing bodies", async () => {
    createAuthorizedImportClient();

    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));
    const headers = createMultipartHeaders(formData);
    headers.set("content-type", "multipart/form-data; charset=utf-8");
    const request = createImportRequest(formData, headers);

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("returns 422 when required period fields are blank after trimming", async () => {
    createAuthorizedImportClient();

    const formData = new FormData();
    formData.set("agencyId", AGENCY_ID);
    formData.set("file", await createPayrollFile([validPayrollRow]));
    formData.set("periodEnd", "2026-06-30");
    formData.set("periodStart", "   ");

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("parses Excel, applies mappings, persists rows, and audits successful imports", async () => {
    const { db } = createAuthorizedImportClient();
    db.column_mappings.push({
      agency_id: AGENCY_ID,
      display_label: "Prime transport",
      source_column: "prime_transport",
      target_category: "BENEFIT",
    });
    db.employees.push({
      agency_id: AGENCY_ID,
      employee_id: "EMP-001",
    });

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      await createPayrollFile([
        {
          ...validPayrollRow,
          payment_date: new Date(2026, 5, 25),
          period_end: new Date(2026, 5, 30),
          period_start: new Date(2026, 5, 1),
          prime_transport: 50000,
        },
      ]),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        importId: "00000000-0000-0000-0000-100000000001",
        invalidRowCount: 0,
        status: "READY_FOR_PREVIEW",
        unknownColumns: [],
        unknownEmployeeCount: 0,
        validRowCount: 1,
      },
    });
    expect(supabaseAdminMocks.createAdminClient).toHaveBeenCalledOnce();
    expect(db.payroll_imports).toHaveLength(1);
    expect(db.payroll_imports).toMatchObject([
      {
        agency_id: AGENCY_ID,
        invalid_row_count: 0,
        period_end: "2026-06-30",
        period_start: "2026-06-01",
        source_filename: "payroll.xlsx",
        status: "READY_FOR_PREVIEW",
        unknown_employee_count: 0,
        uploaded_by: ACTOR_PROFILE_ID,
        valid_row_count: 1,
      },
    ]);
    expect(db.payroll_import_rows.length).toBeGreaterThan(0);
    expect(db.payroll_import_rows).toMatchObject([
      {
        agency_id: AGENCY_ID,
        employee_email: "employee@example.com",
        employee_id: "EMP-001",
        employee_name: "Employee One",
        normalized_data: expect.objectContaining({
          paymentDate: "2026-06-25",
          periodEnd: "2026-06-30",
          periodStart: "2026-06-01",
        }),
        pay_items: [
          {
            amount: 50000,
            category: "BENEFIT",
            label: "Prime transport",
            rawValue: 50000,
          },
        ],
      },
    ]);
    expect(db.payroll_import_rows[0]).not.toHaveProperty("raw_file");
    expect(db.payroll_import_errors).toHaveLength(0);
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYROLL_IMPORT_COMPLETED",
        actorProfileId: ACTOR_PROFILE_ID,
        agencyId: AGENCY_ID,
        metadata: {
          agencyId: AGENCY_ID,
          filename: "payroll.xlsx",
          importId: "00000000-0000-0000-0000-100000000001",
          periodEnd: "2026-06-30",
          periodStart: "2026-06-01",
          rowCount: 1,
          status: "READY_FOR_PREVIEW",
        },
        resourceId: "00000000-0000-0000-0000-100000000001",
        resourceType: "payroll_import",
      }),
    );
  });

  it("persists invalid row errors while importing the valid rows", async () => {
    const { db } = createAuthorizedImportClient();
    db.employees.push({
      agency_id: AGENCY_ID,
      employee_id: "EMP-001",
    });

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      await createPayrollFile([
        validPayrollRow,
        {
          ...validPayrollRow,
          email: "not-an-email",
          employee_id: "EMP-002",
          employee_name: "",
        },
      ]),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        invalidRowCount: 1,
        status: "READY_FOR_PREVIEW",
        unknownEmployeeCount: 0,
        validRowCount: 1,
      },
    });
    expect(db.payroll_import_rows).toHaveLength(1);
    expect(db.payroll_import_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error_code: expect.any(String),
          field_name: "email",
          import_id: "00000000-0000-0000-0000-100000000001",
          row_number: 3,
        }),
        expect.objectContaining({
          error_code: expect.any(String),
          field_name: "employeeName",
          import_id: "00000000-0000-0000-0000-100000000001",
          row_number: 3,
        }),
      ]),
    );
  });

  it("records a line error when a row period does not match the submitted period", async () => {
    const { db } = createAuthorizedImportClient();
    db.employees.push({
      agency_id: AGENCY_ID,
      employee_id: "EMP-001",
    });

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      await createPayrollFile([
        validPayrollRow,
        {
          ...validPayrollRow,
          employee_id: "EMP-002",
          email: "employee-two@example.com",
          period_end: "2026-07-31",
        },
      ]),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        invalidRowCount: 1,
        status: "READY_FOR_PREVIEW",
        validRowCount: 1,
      },
    });
    expect(db.payroll_import_rows).toHaveLength(1);
    expect(db.payroll_import_errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error_code: "period_mismatch",
          field_name: "periodEnd",
          import_id: "00000000-0000-0000-0000-100000000001",
          row_number: 3,
        }),
      ]),
    );
  });

  it("marks imports as failed when the worksheet exceeds 2000 useful payroll rows", async () => {
    const { db } = createAuthorizedImportClient();
    const rows = Array.from({ length: 2001 }, (_, index) => ({
      ...validPayrollRow,
      email: `employee-${index + 1}@example.com`,
      employee_id: `EMP-${String(index + 1).padStart(4, "0")}`,
    }));

    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile(rows));

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        invalidRowCount: 0,
        status: "FAILED",
        validRowCount: 0,
      },
    });
    expect(db.payroll_imports[0]).toMatchObject({
      status: "FAILED",
      valid_row_count: 0,
    });
    expect(db.payroll_import_rows).toHaveLength(0);
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYROLL_IMPORT_FAILED",
        metadata: expect.objectContaining({
          rowCount: 0,
        }),
      }),
    );
  });

  it("marks imports as needing mapping when valid rows include unmapped unknown columns", async () => {
    const { db } = createAuthorizedImportClient();
    db.employees.push({
      agency_id: AGENCY_ID,
      employee_id: "EMP-001",
    });

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      await createPayrollFile([{ ...validPayrollRow, cafeteria: 2500 }]),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        invalidRowCount: 0,
        status: "NEEDS_MAPPING",
        unknownColumns: ["cafeteria"],
        validRowCount: 1,
      },
    });
    expect(db.payroll_imports[0]).toMatchObject({
      status: "NEEDS_MAPPING",
      valid_row_count: 1,
    });
    expect(db.payroll_import_rows[0]).toMatchObject({
      pay_items: [],
      raw_unknown_columns: {
        cafeteria: 2500,
      },
    });
  });

  it("marks imports as failed when unknown columns exist but no valid rows can be mapped", async () => {
    const { db } = createAuthorizedImportClient();

    const formData = new FormData();
    appendRequiredImportFields(
      formData,
      await createPayrollFile([
        {
          ...validPayrollRow,
          cafeteria: 2500,
          email: "not-an-email",
          employee_name: "",
        },
      ]),
    );

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        invalidRowCount: 1,
        status: "FAILED",
        unknownColumns: [],
        validRowCount: 0,
      },
    });
    expect(db.payroll_imports[0]).toMatchObject({
      status: "FAILED",
      valid_row_count: 0,
    });
    expect(db.payroll_import_rows).toHaveLength(0);
  });

  it("counts valid rows whose employee ids are not known for the agency", async () => {
    const { db } = createAuthorizedImportClient();

    const formData = new FormData();
    appendRequiredImportFields(formData, await createPayrollFile([validPayrollRow]));

    const response = await POST(createImportRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        unknownEmployeeCount: 1,
        validRowCount: 1,
      },
    });
    expect(db.payroll_imports[0]).toMatchObject({
      unknown_employee_count: 1,
    });
  });
});
