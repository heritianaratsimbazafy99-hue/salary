import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), admin: vi.fn(), send: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env.public", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "https://salary.example.com" } }));
vi.mock("@/lib/admin/auth", () => ({ getCurrentAgencyScopedActor: mocks.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.read }));
vi.mock("@/lib/notifications/resend-server", () => ({ EMAIL_DELIVERY_UNCONFIRMED: "EMAIL_DELIVERY_UNCONFIRMED", sendPayslipPublishedEmail: mocks.send,
  sendPayslipPublishedEmails: async (inputs: unknown[]) => Promise.all(inputs.map(async (input) => {
    try { return await mocks.send(input); }
    catch { return { data: null, error: { message: "Email delivery failed." } }; }
  })),
}));
vi.mock("@/lib/audit/server", () => ({ recordAuditEvent: mocks.audit }));

import { POST } from "@/app/api/imports/[importId]/invitations/route";

const AGENCY = "00000000-0000-0000-0000-000000000001";
const IMPORT = "00000000-0000-0000-0000-000000000002";
const ACTOR = "00000000-0000-0000-0000-000000000003";
type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

function database(options: { onEmployeeRead?: (employee: Row | undefined) => Promise<void>; failRollback?: boolean } = {}) {
  const db: Db = {
    agencies: [{ id: AGENCY, is_active: true }],
    payroll_imports: [{ id: IMPORT, agency_id: AGENCY, status: "PUBLISHED" }],
    payroll_import_rows: [{ id: "row", agency_id: AGENCY, import_id: IMPORT, employee_id: "EMP-1", employee_email: "old@example.com" }],
    employees: [{ agency_id: AGENCY, employee_id: "EMP-1", email: "current@example.com", full_name: "Current Worker", is_active: true, profile_id: null }],
    employee_invitations: [{ id: "invitation", agency_id: AGENCY, employee_id: "EMP-1", email: "old@example.com", full_name: "Old Worker", invited_by: ACTOR, token_hash: "old-hash", status: "PENDING", expires_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z" }],
  };
  const client = { from: vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let update: Row | undefined;
    let range: [number, number] | undefined;
    let upsert: Row | undefined;
    function run() {
      let rows = db[table].filter((row) => filters.every((filter) => filter(row)));
      if (upsert) {
        const duplicate = db[table].find((row) => row.agency_id === upsert!.agency_id && row.employee_id === upsert!.employee_id && row.status === upsert!.status);
        if (duplicate) return [];
        const inserted = { ...upsert, id: `new-${db[table].length}` };
        db[table].push(inserted);
        rows = [inserted];
      }
      if (update) rows.forEach((row) => Object.assign(row, update));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return rows.map((row) => ({ ...row }));
    }
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; }),
      order: vi.fn(() => query),
      range: vi.fn((start: number, end: number) => { range = [start, end]; return query; }),
      update: vi.fn((value: Row) => { update = value; return query; }),
      upsert: vi.fn((value: Row) => { upsert = value; return query; }),
      single: vi.fn(async () => { const rows = run(); return { data: rows[0] ?? null, error: rows.length ? null : { code: "PGRST116" } }; }),
      maybeSingle: vi.fn(async () => {
        const row = run()[0];
        if (table === "employees") await options.onEmployeeRead?.(row);
        return { data: row ?? null, error: null };
      }),
      then: (resolve: (value: unknown) => unknown) => {
        if (options.failRollback && update?.token_hash === "old-hash") return Promise.resolve({ data: null, error: { message: "DB write failed" } }).then(resolve);
        return Promise.resolve({ data: run(), error: null }).then(resolve);
      },
    };
    return query;
  }) };
  mocks.read.mockResolvedValue(client);
  mocks.admin.mockReturnValue(client);
  return { db, client };
}
const request = (origin?: string) => POST({ headers: new Headers(origin ? { origin } : {}) } as NextRequest, { params: Promise.resolve({ importId: IMPORT }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: ACTOR, agencyId: AGENCY, role: "agency_manager" });
  mocks.send.mockResolvedValue({ data: { id: "email" }, error: null });
  mocks.audit.mockResolvedValue(undefined);
});

describe("POST import invitation resend", () => {
  it("allows the canonical Origin and rejects foreign origins before authentication", async () => {
    database();
    expect((await request("https://attacker.example.com")).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect((await request("https://salary.example.com")).status).toBe(200);
  });
  it("refreshes an expired link using current employee details without modifying the employee", async () => {
    const { db } = database();
    const employeeBefore = { ...db.employees[0] };
    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { sent: 1, failed: 0, skipped: 0, unconfirmed: 0 } });
    const email = mocks.send.mock.calls[0][0];
    expect(email).toMatchObject({ to: "current@example.com", employeeName: "Current Worker" });
    expect(db.employee_invitations[0].token_hash).toBe(createHash("sha256").update(email.invitationToken).digest("hex"));
    expect(Date.parse(db.employee_invitations[0].expires_at as string)).toBeGreaterThan(Date.now());
    expect(db.employees[0]).toEqual(employeeBefore);
    expect(JSON.stringify(db)).not.toContain(email.invitationToken);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(email.invitationToken);
  });

  it("durably throttles repeated sends, including invitations created at initial publication", async () => {
    const { db } = database();
    db.employee_invitations[0].updated_at = new Date().toISOString();
    await expect((await request()).json()).resolves.toEqual({ data: { sent: 0, failed: 0, skipped: 1, unconfirmed: 0 } });
    expect(mocks.send).not.toHaveBeenCalled();
    db.employee_invitations[0].updated_at = "2020-01-01T00:00:00.000Z";
    await request();
    await expect((await request()).json()).resolves.toEqual({ data: { sent: 0, failed: 0, skipped: 1, unconfirmed: 0 } });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it.each(["REVOKED", "EXPIRED"])("creates a new pending invitation alongside %s history", async (status) => {
    const { db } = database();
    db.employee_invitations[0].status = status;
    await request();
    expect(db.employee_invitations).toHaveLength(2);
    expect(db.employee_invitations[0].status).toBe(status);
    expect(db.employee_invitations[1].status).toBe("PENDING");
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it.each(["linked", "inactive", "accepted"])("skips %s employees", async (condition) => {
    const { db } = database();
    if (condition === "linked") db.employees[0].profile_id = "profile";
    if (condition === "inactive") db.employees[0].is_active = false;
    if (condition === "accepted") db.employee_invitations[0].status = "ACCEPTED";
    await expect((await request()).json()).resolves.toEqual({ data: { sent: 0, failed: 0, skipped: 1, unconfirmed: 0 } });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["employee", "hr_central", "super_admin"])("refuses the %s role before privileged access", async (role) => {
    database();
    mocks.actor.mockResolvedValue({ id: ACTOR, agencyId: AGENCY, role });
    expect((await request()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses another agency and inactive agencies", async () => {
    const { db } = database();
    db.payroll_imports[0].agency_id = "other-agency";
    expect((await request()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    db.payroll_imports[0].agency_id = AGENCY;
    db.agencies[0].is_active = false;
    expect((await request()).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires authentication and a published import", async () => {
    const { db } = database();
    mocks.actor.mockRejectedValueOnce(new Error("Authentification requise."));
    expect((await request()).status).toBe(401);
    db.payroll_imports[0].status = "READY_FOR_PREVIEW";
    expect((await request()).status).toBe(409);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("counts provider failure without leaking its message or the token", async () => {
    const { db } = database();
    db.employee_invitations[0].email = "current@example.com";
    mocks.send.mockImplementationOnce(async ({ invitationToken }) => { throw new Error(`token=${invitationToken}`); });
    const response = await request();
    await expect(response.json()).resolves.toEqual({ data: { sent: 0, failed: 1, skipped: 0, unconfirmed: 0 } });
    const token = mocks.send.mock.calls[0][0].invitationToken;
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(token);
    expect(db.employee_invitations[0].token_hash).toBe("old-hash");
    expect(Date.parse(db.employee_invitations[0].updated_at as string)).toBeGreaterThan(Date.now() - 10_000);
    await expect((await request()).json()).resolves.toEqual({ data: { sent: 0, failed: 0, skipped: 1, unconfirmed: 0 } });
  });
});

it("preserves the newest invitation token when delivery is uncertain", async () => {
  const { db } = database();
  db.employee_invitations[0].email = "current@example.com";
  mocks.send.mockResolvedValueOnce({ data: null, error: { message: "Unknown delivery", code: "EMAIL_DELIVERY_UNCONFIRMED" } });
  await expect((await request()).json()).resolves.toEqual({ data: { sent: 0, failed: 0, skipped: 0, unconfirmed: 1 } });
  const newToken = mocks.send.mock.calls[0][0].invitationToken;
  expect(db.employee_invitations[0].token_hash).toBe(createHash("sha256").update(newToken).digest("hex"));
  expect(db.employee_invitations[0].token_hash).not.toBe("old-hash");
});


it("prepares 340 resend recipients in order with at most eight concurrent operations and exact mixed counts", async () => {
  let active = 0;
  let peak = 0;
  const { db } = database({ onEmployeeRead: async (employee) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, Number(employee?.employee_id === "EMP-0" ? 8 : 1)));
    active--;
    if (employee?.employee_id === "EMP-17") throw new Error("Read unavailable");
  } });
  db.payroll_import_rows = Array.from({ length: 340 }, (_, index) => ({ id: `row-${index}`, agency_id: AGENCY, import_id: IMPORT, employee_id: `EMP-${index}` }));
  db.employees = Array.from({ length: 340 }, (_, index) => ({ agency_id: AGENCY, employee_id: `EMP-${index}`, email: `worker${index}@example.com`, full_name: `Worker ${index}`, is_active: index !== 23, profile_id: null }));
  db.employee_invitations = Array.from({ length: 340 }, (_, index) => ({ id: `invitation-${index}`, agency_id: AGENCY, employee_id: `EMP-${index}`, email: `worker${index}@example.com`, full_name: `Worker ${index}`, invited_by: ACTOR, token_hash: `old-${index}`, status: index === 24 ? "ACCEPTED" : "PENDING", expires_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z" }));
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { sent: 337, failed: 1, skipped: 2, unconfirmed: 0 } });
  expect(peak).toBe(8); expect(active).toBe(0);
  expect(mocks.send.mock.calls.map((call) => call[0].to)).toEqual(Array.from({ length: 340 }, (_, index) => index).filter((index) => ![17, 23, 24].includes(index)).map((index) => `worker${index}@example.com`));
});

it("reports and audits a structured rollback persistence error instead of silently claiming restoration", async () => {
  const { db } = database({ failRollback: true });
  db.employee_invitations[0].email = "current@example.com";
  mocks.send.mockResolvedValueOnce({ data: null, error: { message: "Rejected" } });
  const response = await request();
  expect(response.status).toBe(503);
  expect((await response.json()).error.message).toContain("Contactez le support");
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ rollbackFailed: 1, failed: 1 }) }));
  expect(db.employee_invitations[0].token_hash).not.toBe("old-hash");
});
