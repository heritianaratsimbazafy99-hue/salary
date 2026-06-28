import { createHash } from "node:crypto";

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationConfirmation } from "@/components/imports/InvitationConfirmation";
import { buildInvitationCandidates } from "@/lib/employees/invitations";

const invitationRouteMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: invitationRouteMocks.createAdminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: invitationRouteMocks.createClient,
}));

const ACCEPTANCE_TOKEN = "a".repeat(40);
const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const EMPLOYEE_ID = "EMP-001";
const AUTH_USER_ID = "00000000-0000-0000-0000-000000000301";

describe("buildInvitationCandidates", () => {
  it("returns unknown employees only once", () => {
    const result = buildInvitationCandidates([
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-002", email: "two@example.com", employeeName: "Two", exists: true },
    ]);

    expect(result).toEqual([{ employeeId: "EMP-001", email: "one@example.com", employeeName: "One" }]);
  });
});

describe("POST /api/employee/invitations/accept", () => {
  beforeEach(() => {
    vi.resetModules();
    invitationRouteMocks.createAdminClient.mockReset();
    invitationRouteMocks.createClient.mockReset();
  });

  it("accepts the invitation through the atomic RPC", async () => {
    const serverClient = createInvitationServerClient();
    const adminClient = createInvitationAdminClient({
      rpcData: {
        agency_id: AGENCY_ID,
        employee_id: EMPLOYEE_ID,
        status: "ACCEPTED",
      },
    });
    invitationRouteMocks.createClient.mockResolvedValue(serverClient);
    invitationRouteMocks.createAdminClient.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/employee/invitations/accept/route");
    const response = await POST(createAcceptInvitationRequest(ACCEPTANCE_TOKEN));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        agencyId: AGENCY_ID,
        employeeId: EMPLOYEE_ID,
        status: "ACCEPTED",
      },
    });
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "accept_employee_invitation",
      expect.objectContaining({
        p_auth_user_id: AUTH_USER_ID,
        p_token_hash: hashTokenForTest(ACCEPTANCE_TOKEN),
      }),
    );
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("rejects an invitation when the atomic RPC denies the profile", async () => {
    const serverClient = createInvitationServerClient();
    const adminClient = createInvitationAdminClient({
      rpcError: { message: "forbidden" },
    });
    invitationRouteMocks.createClient.mockResolvedValue(serverClient);
    invitationRouteMocks.createAdminClient.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/employee/invitations/accept/route");
    const response = await POST(createAcceptInvitationRequest(ACCEPTANCE_TOKEN));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("does not bind the employee when the atomic RPC returns no accepted row", async () => {
    const serverClient = createInvitationServerClient();
    const adminClient = createInvitationAdminClient({
      initialEmployeeProfileId: null,
      rpcData: null,
    });
    invitationRouteMocks.createClient.mockResolvedValue(serverClient);
    invitationRouteMocks.createAdminClient.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/employee/invitations/accept/route");
    const response = await POST(createAcceptInvitationRequest(ACCEPTANCE_TOKEN));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    expect(adminClient.employees[0]).toMatchObject({ profile_id: null });
    expect(adminClient.from).not.toHaveBeenCalled();
  });
});

describe("InvitationConfirmation", () => {
  it("renders the empty state", () => {
    render(createElement(InvitationConfirmation, { candidates: [] }));

    expect(screen.getByText("Aucun nouveau salarie a inviter.")).toBeTruthy();
  });

  it("renders candidates with a checked invitation checkbox", () => {
    render(
      createElement(InvitationConfirmation, {
        candidates: [{ employeeId: "EMP-003", email: "three@example.com", employeeName: "Three" }],
      }),
    );

    expect(screen.getByRole("heading", { name: "Nouveaux salaries detectes" })).toBeTruthy();
    expect(screen.getByText("Three")).toBeTruthy();
    expect(screen.getByText("three@example.com")).toBeTruthy();

    const checkbox = screen.getByRole("checkbox", { name: /Three/ }) as HTMLInputElement;
    expect(checkbox.name).toBe("inviteEmployeeId");
    expect(checkbox.value).toBe("EMP-003");
    expect(checkbox.checked).toBe(true);
  });

  it("keeps long candidate details wrappable on narrow screens", () => {
    const longName = "A Very Long Employee Name That Should Wrap Without Breaking The Row";
    const longEmail = "averylongemployeeemailaddresswithoutnaturalbreaks@example-company-with-a-long-domain.test";

    render(
      createElement(InvitationConfirmation, {
        candidates: [{ employeeId: "EMP-004", email: longEmail, employeeName: longName }],
      }),
    );

    const name = screen.getByText(longName);
    const email = screen.getByText(longEmail);
    const textWrapper = name.parentElement;
    const label = name.closest("label");

    expect(label?.className).toContain("items-start");
    expect(textWrapper?.className).toContain("min-w-0");
    expect(textWrapper?.className).toContain("flex-1");
    expect(name.className).toContain("break-words");
    expect(email.className).toContain("break-all");
  });
});

function createAcceptInvitationRequest(token: string) {
  return {
    json: vi.fn(async () => ({ token })),
  } as unknown as NextRequest;
}

function createInvitationServerClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: AUTH_USER_ID } },
        error: null,
      })),
    },
    from: vi.fn(),
  };
}

function createInvitationAdminClient(input: {
  initialEmployeeProfileId?: string | null;
  rpcData?: Record<string, unknown> | null;
  rpcError?: unknown;
}) {
  const employees = [
    {
      agency_id: AGENCY_ID,
      employee_id: EMPLOYEE_ID,
      profile_id: input.initialEmployeeProfileId ?? null,
    },
  ];

  return {
    employees,
    from: vi.fn((table: string) => {
      throw new Error(`Unexpected admin table ${table}`);
    }),
    rpc: vi.fn(async () => ({
      data: input.rpcData ?? null,
      error: input.rpcError ?? null,
    })),
  };
}

function hashTokenForTest(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
