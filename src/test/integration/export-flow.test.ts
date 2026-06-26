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

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

type ExportTableRow = Record<string, unknown>;

type ExportTestDb = {
  agency_memberships: ExportTableRow[];
  profiles: ExportTableRow[];
};

function createExportDb(): ExportTestDb {
  return {
    agency_memberships: [],
    profiles: [],
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
    single: async () => {
      const row = rows.find((candidate) => filters.every((filter) => filter(candidate)));

      return {
        data: row ?? null,
        error: row ? null : { code: "PGRST116", message: "No rows" },
      };
    },
  };

  return query;
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
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    mockExportClient({ authUserId: null });

    const response = await POST(createExportRequest({ exportType: "IMPORT_REPORT" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 and VALIDATION_ERROR for invalid export types", async () => {
    mockExportClient();

    const response = await POST(createExportRequest({ exportType: "PAYROLL_ROWS" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
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
    },
  );

  it("returns 422 and VALIDATION_ERROR for malformed JSON", async () => {
    mockExportClient();

    const response = await POST(createMalformedJsonRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
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
  });

  it("returns pending export metadata for authorized valid requests", async () => {
    mockExportClient({ actorRole: "hr_central" });

    const response = await POST(createExportRequest({ exportType: "PUBLISHED_PAYSLIPS" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: "PENDING", exportType: "PUBLISHED_PAYSLIPS" },
    });
  });
});
