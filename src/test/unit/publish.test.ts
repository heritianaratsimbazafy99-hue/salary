import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/imports/[importId]/publish/route";
import { nextVersionNumber } from "@/lib/payroll/publish";
import type { AppRole } from "@/lib/roles";

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_AGENCY_ID = "00000000-0000-0000-0000-000000000202";
const ACTOR_PROFILE_ID = "00000000-0000-0000-0000-000000000301";
const ACTOR_AUTH_USER_ID = "00000000-0000-0000-0000-000000000401";
const IMPORT_ID = "00000000-0000-0000-0000-000000000501";
const EMPLOYEE_ONE_ID = "00000000-0000-0000-0000-000000000601";
const EMPLOYEE_ONE_PROFILE_ID = "00000000-0000-0000-0000-000000000602";
const EXISTING_PAYSLIP_ID = "00000000-0000-0000-0000-000000000701";
const OLD_VERSION_ID = "00000000-0000-0000-0000-000000000801";

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

type PublishTableRow = Record<string, unknown>;

type PublishTestDb = {
  profiles: PublishTableRow[];
  agency_memberships: PublishTableRow[];
  payroll_imports: PublishTableRow[];
  payroll_import_rows: PublishTableRow[];
  employees: PublishTableRow[];
  payslips: PublishTableRow[];
  payslip_versions: PublishTableRow[];
  notifications: PublishTableRow[];
};

function createPublishDb(): PublishTestDb {
  return {
    agency_memberships: [],
    employees: [],
    notifications: [],
    payroll_import_rows: [],
    payroll_imports: [],
    payslip_versions: [],
    payslips: [],
    profiles: [],
  };
}

function createSupabaseClient(options: {
  db: PublishTestDb;
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
    from: vi.fn((table: keyof PublishTestDb) => createTableQuery(options.db, table)),
  };
}

function createTableQuery(db: PublishTestDb, table: keyof PublishTestDb) {
  return {
    insert(payload: PublishTableRow | PublishTableRow[]) {
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
    update(payload: PublishTableRow) {
      return createUpdateQuery(db[table], payload);
    },
    upsert(payload: PublishTableRow, options?: { onConflict?: string }) {
      const conflictColumns = options?.onConflict?.split(",").map((column) => column.trim()) ?? [];
      const existingRow = db[table].find((row) =>
        conflictColumns.length > 0 && conflictColumns.every((column) => row[column] === payload[column]),
      );

      if (existingRow) {
        Object.assign(existingRow, payload);
        return createMutationResult([existingRow]);
      }

      const insertedRow = {
        ...payload,
        id: payload.id ?? generatedIdFor(table, db[table].length + 1),
      };
      db[table].push(insertedRow);
      return createMutationResult([insertedRow]);
    },
  };
}

function createMutationResult(rows: PublishTableRow[]) {
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

function createSelectQuery(rows: PublishTableRow[]) {
  const filters: Array<(row: PublishTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
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
    then(resolve: (value: { data: PublishTableRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: filteredRows(), error: null }).then(resolve, reject);
    },
  };

  function filteredRows() {
    return rows.filter((row) => filters.every((filter) => filter(row)));
  }

  return query;
}

function createUpdateQuery(rows: PublishTableRow[], payload: PublishTableRow) {
  const filters: Array<(row: PublishTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    is(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    then(resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      rows.filter((row) => filters.every((filter) => filter(row))).forEach((row) => {
        Object.assign(row, payload);
      });
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };

  return query;
}

function generatedIdFor(table: keyof PublishTestDb, index: number) {
  if (table === "employees") return `00000000-0000-0000-0000-60000000000${index}`;
  if (table === "payslips") return `00000000-0000-0000-0000-70000000000${index}`;
  if (table === "payslip_versions") return `00000000-0000-0000-0000-80000000000${index}`;
  if (table === "notifications") return `00000000-0000-0000-0000-90000000000${index}`;
  return `00000000-0000-0000-0000-50000000000${index}`;
}

function createAuthorizedPublishClient(options: {
  actorRole?: AppRole;
  actorAgencyId?: string | null;
  db?: PublishTestDb;
  authUserId?: string | null;
} = {}) {
  const db = options.db ?? createPublishDb();
  const client = createSupabaseClient({
    actorAgencyId: options.actorAgencyId ?? AGENCY_ID,
    actorRole: options.actorRole ?? "agency_manager",
    authUserId: "authUserId" in options ? options.authUserId : ACTOR_AUTH_USER_ID,
    db,
  });
  supabaseMocks.createClient.mockResolvedValue(client);
  return { client, db };
}

function createAdminPublishClient(db: PublishTestDb) {
  const client = createSupabaseClient({ authUserId: null, db });
  adminMocks.createAdminClient.mockReturnValue(client);
  return client;
}

function createPublishRequest() {
  return {} as NextRequest;
}

function createPublishContext(importId: string) {
  return {
    params: Promise.resolve({ importId }),
  };
}

function seedPublishImport(
  db: PublishTestDb,
  agencyId = AGENCY_ID,
  status: string = "READY_FOR_PREVIEW",
) {
  db.payroll_imports.push({
    agency_id: agencyId,
    id: IMPORT_ID,
    period_end: "2026-06-30",
    period_start: "2026-06-01",
    status,
  });
}

describe("nextVersionNumber", () => {
  it("starts at version one", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("increments from highest existing version", () => {
    expect(nextVersionNumber([1, 3, 2])).toBe(4);
  });
});

describe("POST /api/imports/:importId/publish", () => {
  beforeEach(() => {
    adminMocks.createAdminClient.mockReset();
    supabaseMocks.createClient.mockReset();
    auditMocks.recordAuditEvent.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    createAuthorizedPublishClient({ authUserId: null });

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "not-a-uuid"])(
    "returns 422 and VALIDATION_ERROR when the import id is invalid: %j",
    async (importId) => {
      createAuthorizedPublishClient();

      const response = await POST(createPublishRequest(), createPublishContext(importId));

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(["employee", "hr_central"] as const)(
    "returns 403 and does not publish when the actor is %s",
    async (actorRole) => {
      const { db } = createAuthorizedPublishClient({ actorRole });
      seedPublishImport(db);

      const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "FORBIDDEN" },
      });
      expect(db.payslip_versions).toHaveLength(0);
      expect(db.notifications).toHaveLength(0);
      expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
      expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
    },
  );

  it("returns 403 and does not publish when the import belongs to another agency", async () => {
    const { db } = createAuthorizedPublishClient();
    seedPublishImport(db, OTHER_AGENCY_ID);

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(db.payslip_versions).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["NEEDS_MAPPING", "FAILED", "PUBLISHED"] as const)(
    "returns 409 and does not publish when the import status is %s",
    async (status) => {
      const { db } = createAuthorizedPublishClient();
      seedPublishImport(db, AGENCY_ID, status);
      db.payroll_import_rows.push({
        agency_id: AGENCY_ID,
        employee_email: "employee@example.com",
        employee_id: "EMP-001",
        employee_name: "Employee One",
        import_id: IMPORT_ID,
        normalized_data: { employeeId: "EMP-001", netAmount: 1100000 },
        pay_items: [],
      });

      const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "CONFLICT" },
      });
      expect(adminMocks.createAdminClient).not.toHaveBeenCalled();
      expect(db.payslip_versions).toHaveLength(0);
      expect(db.notifications).toHaveLength(0);
      expect(db.payroll_imports[0]).toMatchObject({ status });
      expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("publishes import rows into payslip versions, current pointers, notifications, and audit", async () => {
    const { db } = createAuthorizedPublishClient();
    const adminClient = createAdminPublishClient(db);
    seedPublishImport(db);
    db.employees.push({
      agency_id: AGENCY_ID,
      email: "employee@example.com",
      employee_id: "EMP-001",
      full_name: "Old Name",
      id: EMPLOYEE_ONE_ID,
      profile_id: EMPLOYEE_ONE_PROFILE_ID,
    });
    db.payslips.push({
      agency_id: AGENCY_ID,
      current_version_id: OLD_VERSION_ID,
      employee_id: EMPLOYEE_ONE_ID,
      id: EXISTING_PAYSLIP_ID,
      period_end: "2026-06-30",
      period_start: "2026-06-01",
      published_by: ACTOR_PROFILE_ID,
    });
    db.payslip_versions.push({
      agency_id: AGENCY_ID,
      id: OLD_VERSION_ID,
      import_id: "00000000-0000-0000-0000-000000000999",
      pay_items: [],
      payslip_id: EXISTING_PAYSLIP_ID,
      published_by: ACTOR_PROFILE_ID,
      replaced_at: null,
      snapshot_data: { employeeId: "EMP-001", netAmount: 1000 },
      version_number: 1,
    });
    db.payroll_import_rows.push(
      {
        agency_id: AGENCY_ID,
        employee_email: "employee@example.com",
        employee_id: "EMP-001",
        employee_name: "Employee One",
        import_id: IMPORT_ID,
        normalized_data: { employeeId: "EMP-001", netAmount: 1100000 },
        pay_items: [{ amount: 50000, category: "BENEFIT", label: "Prime transport" }],
      },
      {
        agency_id: AGENCY_ID,
        employee_email: "New.Person@Example.COM",
        employee_id: "EMP-002",
        employee_name: "New Person",
        import_id: IMPORT_ID,
        normalized_data: { employeeId: "EMP-002", netAmount: 900000 },
        pay_items: [],
      },
    );

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        importId: IMPORT_ID,
        publishedCount: 2,
        status: "PUBLISHED",
      },
    });
    expect(adminMocks.createAdminClient).toHaveBeenCalledOnce();
    expect(adminClient.from).toHaveBeenCalledWith("notifications");

    expect(db.payroll_imports[0]).toMatchObject({ status: "PUBLISHED" });
    expect(db.employees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employee_id: "EMP-001",
          email: "employee@example.com",
          full_name: "Employee One",
          id: EMPLOYEE_ONE_ID,
        }),
        expect.objectContaining({
          agency_id: AGENCY_ID,
          employee_id: "EMP-002",
          email: "new.person@example.com",
          full_name: "New Person",
        }),
      ]),
    );

    const replacementVersion = db.payslip_versions.find(
      (version) => version.payslip_id === EXISTING_PAYSLIP_ID && version.id !== OLD_VERSION_ID,
    );
    expect(replacementVersion).toMatchObject({
      agency_id: AGENCY_ID,
      import_id: IMPORT_ID,
      pay_items: [{ amount: 50000, category: "BENEFIT", label: "Prime transport" }],
      published_by: ACTOR_PROFILE_ID,
      snapshot_data: { employeeId: "EMP-001", netAmount: 1100000 },
      version_number: 2,
    });
    expect(db.payslip_versions.find((version) => version.id === OLD_VERSION_ID)).toMatchObject({
      replaced_at: expect.any(String),
    });
    expect(db.payslips.find((payslip) => payslip.id === EXISTING_PAYSLIP_ID)).toMatchObject({
      current_version_id: replacementVersion?.id,
    });

    const createdEmployee = db.employees.find((employee) => employee.employee_id === "EMP-002");
    const createdPayslip = db.payslips.find((payslip) => payslip.employee_id === createdEmployee?.id);
    const createdVersion = db.payslip_versions.find((version) => version.payslip_id === createdPayslip?.id);
    expect(createdPayslip).toMatchObject({
      agency_id: AGENCY_ID,
      current_version_id: createdVersion?.id,
      period_end: "2026-06-30",
      period_start: "2026-06-01",
      published_by: ACTOR_PROFILE_ID,
    });
    expect(createdVersion).toMatchObject({
      agency_id: AGENCY_ID,
      import_id: IMPORT_ID,
      published_by: ACTOR_PROFILE_ID,
      snapshot_data: { employeeId: "EMP-002", netAmount: 900000 },
      version_number: 1,
    });

    expect(db.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_type: "PAYSLIP_PUBLISHED",
          recipient_email: "employee@example.com",
          recipient_profile_id: EMPLOYEE_ONE_PROFILE_ID,
          resource_id: EXISTING_PAYSLIP_ID,
          resource_type: "payslip",
          status: "PENDING",
        }),
        expect.objectContaining({
          notification_type: "PAYSLIP_PUBLISHED",
          recipient_email: "new.person@example.com",
          recipient_profile_id: null,
          resource_id: createdPayslip?.id,
          resource_type: "payslip",
          status: "PENDING",
        }),
      ]),
    );
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYROLL_IMPORT_PUBLISHED",
        actorProfileId: ACTOR_PROFILE_ID,
        agencyId: AGENCY_ID,
        metadata: {
          agencyId: AGENCY_ID,
          importId: IMPORT_ID,
          periodEnd: "2026-06-30",
          periodStart: "2026-06-01",
          rowCount: 2,
          status: "PUBLISHED",
        },
        resourceId: IMPORT_ID,
        resourceType: "payroll_import",
      }),
    );
  });
});
