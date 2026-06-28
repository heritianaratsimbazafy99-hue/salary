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

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const adminMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  sendPayslipPublishedEmail: vi.fn(),
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

vi.mock("@/lib/notifications/resend-server", () => ({
  sendPayslipPublishedEmail: notificationMocks.sendPayslipPublishedEmail,
}));

type PublishTableRow = Record<string, unknown>;

type PublishTestDb = {
  profiles: PublishTableRow[];
  agency_memberships: PublishTableRow[];
  payroll_imports: PublishTableRow[];
  payroll_import_rows: PublishTableRow[];
  employee_invitations: PublishTableRow[];
  employees: PublishTableRow[];
  payslips: PublishTableRow[];
  payslip_versions: PublishTableRow[];
  notifications: PublishTableRow[];
};

function createPublishDb(): PublishTestDb {
  return {
    agency_memberships: [],
    employee_invitations: [],
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
    delete() {
      return createDeleteQuery(db[table]);
    },
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

function createDeleteQuery(rows: PublishTableRow[]) {
  const filters: Array<(row: PublishTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    then(resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (filters.every((filter) => filter(rows[index]))) {
          rows.splice(index, 1);
        }
      }

      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };

  return query;
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
  if (table === "employee_invitations") return `00000000-0000-0000-0000-65000000000${index}`;
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

function createPublishRequest() {
  return {} as NextRequest;
}

function createAdminPublishClient(db: PublishTestDb) {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => ({
          data: {
            user: {
              email: payload.email,
              id: "00000000-0000-0000-0000-000000000701",
            },
          },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    },
    from: vi.fn((table: keyof PublishTestDb) => createTableQuery(db, table)),
    rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({
      data: [
        {
          agency_id: AGENCY_ID,
          import_id: IMPORT_ID,
          period_end: "2026-06-30",
          period_start: "2026-06-01",
          published_count: 1,
          status: "PUBLISHED",
        },
      ],
      error: null,
    })),
  };
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

function seedPublishedNotification(db: PublishTestDb, input: {
  importId?: string;
  notificationId?: string;
  payslipId?: string;
  recipientEmail?: string;
} = {}) {
  const payslipId = input.payslipId ?? "00000000-0000-0000-0000-000000000801";

  db.payslip_versions.push({
    agency_id: AGENCY_ID,
    id: "00000000-0000-0000-0000-000000000802",
    import_id: input.importId ?? IMPORT_ID,
    payslip_id: payslipId,
    version_number: 1,
  });
  db.notifications.push({
    id: input.notificationId ?? "00000000-0000-0000-0000-000000000901",
    notification_type: "PAYSLIP_PUBLISHED",
    recipient_email: input.recipientEmail ?? "employee@example.com",
    resource_id: payslipId,
    resource_type: "payslip",
    status: "PENDING",
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
    notificationMocks.sendPayslipPublishedEmail.mockReset();
    notificationMocks.sendPayslipPublishedEmail.mockResolvedValue({
      data: { id: "email-message-id" },
      error: null,
    });
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

  it("publishes through one transactional admin RPC after manager authorization", async () => {
    const { db } = createAuthorizedPublishClient();
    seedPublishImport(db);
    db.payroll_import_rows.push({
      agency_id: AGENCY_ID,
      employee_email: "employee@example.com",
      employee_id: "EMP-001",
      employee_name: "Employee One",
      import_id: IMPORT_ID,
      normalized_data: { employeeId: "EMP-001", netAmount: 1100000 },
      pay_items: [],
    });
    seedPublishedNotification(db);
    const adminClient = createAdminPublishClient(db);
    adminMocks.createAdminClient.mockReturnValue(adminClient);

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        importId: IMPORT_ID,
        publishedCount: 1,
        status: "PUBLISHED",
      },
    });
    expect(adminClient.rpc).toHaveBeenCalledWith("publish_payroll_import", {
      p_actor_agency_id: AGENCY_ID,
      p_actor_profile_id: ACTOR_PROFILE_ID,
      p_import_id: IMPORT_ID,
    });
    expect(adminClient.auth.admin.createUser).not.toHaveBeenCalled();
    expect(db.employee_invitations).toContainEqual(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        email: "employee@example.com",
        employee_id: "EMP-001",
        status: "PENDING",
      }),
    );
    expect(db.employees).toContainEqual(
      expect.objectContaining({
        agency_id: AGENCY_ID,
        email: "employee@example.com",
        employee_id: "EMP-001",
        full_name: "Employee One",
        is_active: true,
        profile_id: null,
      }),
    );
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYROLL_IMPORT_PUBLISHED",
        metadata: expect.objectContaining({
          emailFailedCount: 0,
          emailSentCount: 1,
          notificationCount: 1,
          rowCount: 1,
          status: "PUBLISHED",
        }),
      }),
    );
    expect(notificationMocks.sendPayslipPublishedEmail).toHaveBeenCalledWith({
      employeeName: "Employee One",
      to: "employee@example.com",
    });
    expect(db.notifications[0]).toMatchObject({
      failed_at: null,
      failure_reason: null,
      provider_message_id: "email-message-id",
      status: "SENT",
    });
    expect(db.notifications[0].sent_at).toEqual(expect.any(String));
  });

  it("marks notification delivery failures without failing publication", async () => {
    const { db } = createAuthorizedPublishClient();
    seedPublishImport(db);
    db.payroll_import_rows.push({
      agency_id: AGENCY_ID,
      employee_email: "employee@example.com",
      employee_id: "EMP-001",
      employee_name: "Employee One",
      import_id: IMPORT_ID,
      normalized_data: { employeeId: "EMP-001", netAmount: 1100000 },
      pay_items: [],
    });
    seedPublishedNotification(db);
    notificationMocks.sendPayslipPublishedEmail.mockRejectedValueOnce(new Error("Resend unavailable"));
    adminMocks.createAdminClient.mockReturnValue(createAdminPublishClient(db));

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        importId: IMPORT_ID,
        publishedCount: 1,
        status: "PUBLISHED",
      },
    });
    expect(db.notifications[0]).toMatchObject({
      failure_reason: "Resend unavailable",
      status: "FAILED",
    });
    expect(db.notifications[0].failed_at).toEqual(expect.any(String));
    expect(auditMocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          emailFailedCount: 1,
          emailSentCount: 0,
          notificationCount: 1,
        }),
      }),
    );
  });

  it("returns 500 and does not audit when the transactional publish RPC fails", async () => {
    const { db } = createAuthorizedPublishClient();
    seedPublishImport(db);
    db.payroll_import_rows.push({
      agency_id: AGENCY_ID,
      employee_email: "employee@example.com",
      employee_id: "EMP-001",
      employee_name: "Employee One",
      import_id: IMPORT_ID,
      normalized_data: { employeeId: "EMP-001", netAmount: 1100000 },
      pay_items: [],
    });
    const adminClient = createAdminPublishClient(db);
    adminClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "transaction failed" },
    });
    adminMocks.createAdminClient.mockReturnValue(adminClient);

    const response = await POST(createPublishRequest(), createPublishContext(IMPORT_ID));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(adminClient.rpc).toHaveBeenCalledOnce();
    expect(adminClient.auth.admin.createUser).not.toHaveBeenCalled();
    expect(db.profiles).not.toContainEqual(expect.objectContaining({ email: "employee@example.com" }));
    expect(db.employees).toHaveLength(0);
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
