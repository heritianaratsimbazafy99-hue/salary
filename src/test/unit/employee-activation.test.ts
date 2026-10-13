import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), server: vi.fn(), sendEmail: vi.fn(), cookieSet: vi.fn(), cookieDelete: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.server }));
vi.mock("@/lib/env.server", () => ({ requireSupabaseServiceRoleKey: () => "test-signing-key" }));
vi.mock("@/lib/notifications/resend-server", () => ({ sendEmployeeActivationEmail: mocks.sendEmail }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet, delete: mocks.cookieDelete }) }));
vi.mock("@/lib/env.public", () => ({ getPublicSupabaseConfig: () => ({ appUrl: "https://paie.example.test" }) }));

import {
  getInvitationAvailability,
  createInvitationContext,
  readInvitationContext,
  INVITATION_CONTEXT_COOKIE,
  requestEmployeeActivation,
} from "@/lib/employees/activation";
import { GET } from "@/app/auth/callback/route";
import { activateEmployee } from "@/app/auth/invitation/actions";

const token = "a".repeat(72);
const hash = createHash("sha256").update(token).digest("hex");
const input = { token, email: "employee@example.test", appUrl: "https://paie.example.test" };

function clients(overrides: { status?: string; expires_at?: string; email?: string } = {}) {
  const invitation = {
    status: "PENDING",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    email: input.email,
    ...overrides,
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: invitation, error: null }),
  };
  const admin = {
    from: vi.fn(() => query),
    auth: { admin: { generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: "auth-otp-proof" } }, error: null }) } },
    rpc: vi.fn().mockResolvedValue({ data: { employee_id: "EMP-1", status: "ACCEPTED" }, error: null }),
  };
  const server = {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null }),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: "employee" } }) }) }),
    })),
  };
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.admin.mockReturnValue(admin);
  mocks.server.mockResolvedValue(server);
  return { admin, server, query };
}

function requestActivation(testClients: ReturnType<typeof clients>, request = input) {
  return requestEmployeeActivation(
    request,
    testClients.admin as unknown as Parameters<typeof requestEmployeeActivation>[1],
  );
}

beforeEach(() => vi.clearAllMocks());

describe("employee activation", () => {
  it("only reads the invitation on opening the page", async () => {
    const testClients = clients();
    expect(await getInvitationAvailability(token)).toBe("pending");
    expect(testClients.query.eq).toHaveBeenCalledWith("token_hash", hash);
    expect(testClients.admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("generates an email proof without confirming the account and sends the canonical callback", async () => {
    const testClients = clients();
    expect(await requestActivation(testClients, { ...input, email: " EMPLOYEE@EXAMPLE.TEST " })).toMatchObject({ status: "sent" });
    expect(testClients.admin.auth.admin.generateLink).toHaveBeenCalledExactlyOnceWith({
      email: input.email,
      type: "magiclink",
    });
    expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith({
      to: input.email,
      confirmationUrl: "https://paie.example.test/auth/callback?token_hash=auth-otp-proof",
    });
    expect(testClients.admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { status: "REVOKED", expected: "unavailable" },
    { status: "ACCEPTED", expected: "unavailable" },
    { status: "EXPIRED", expected: "expired" },
    { expires_at: new Date(0).toISOString(), expected: "expired" },
    { expires_at: "invalid", expected: "expired" },
  ])("rejects inactive or expired invitations before creating an account: %j", async ({ expected, ...overrides }) => {
    const testClients = clients(overrides);
    expect(await requestActivation(testClients)).toEqual({ status: expected });
    expect(testClients.admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects a different recipient without creating a user or sending a message", async () => {
    const testClients = clients();
    expect(await requestActivation(testClients, { ...input, email: "other@example.test" })).toEqual({ status: "email_mismatch" });
    expect(testClients.admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("does not send mail after an unexpected account creation failure", async () => {
    const testClients = clients();
    testClients.admin.auth.admin.generateLink.mockResolvedValue({ error: { code: "unexpected_failure" } });
    expect(await requestActivation(testClients)).toEqual({ status: "send_failed" });
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("throttles repeat email requests before generating an Auth token", async () => {
    const testClients = clients();
    testClients.query.maybeSingle.mockResolvedValueOnce({ data: { status: "PENDING", expires_at: new Date(Date.now() + 10000).toISOString(), email: input.email }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect(await requestActivation(testClients)).toEqual({ status: "rate_limited" });
    expect(testClients.admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not return a browser context after delivery failure", async () => {
    const testClients = clients();
    mocks.sendEmail.mockRejectedValue(new Error("delivery failed"));
    await expect(requestActivation(testClients)).rejects.toThrow("delivery failed");
    expect(testClients.admin.rpc).not.toHaveBeenCalled();
  });

  it("keeps the last valid browser context when a resend is throttled", async () => {
    const testClients = clients();
    testClients.query.maybeSingle.mockResolvedValueOnce({ data: { status: "PENDING", expires_at: new Date(Date.now() + 10000).toISOString(), email: input.email }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const form = new FormData();
    form.set("token", token);
    form.set("email", input.email);
    expect(await activateEmployee({ status: "sent" }, form)).toEqual({ status: "rate_limited" });
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("sets a secure HttpOnly context only after the email is sent", async () => {
    clients();
    const form = new FormData();
    form.set("token", token);
    form.set("email", input.email);
    expect(await activateEmployee({ status: "idle" }, form)).toEqual({ status: "sent" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(INVITATION_CONTEXT_COOKIE, expect.any(String), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900,
    });
    expect(mocks.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(mocks.cookieSet.mock.invocationCallOrder[0]);
  });

});

function callbackRequest(withInvitation = true) {
  const request = new NextRequest(`https://paie.example.test/auth/callback?${withInvitation ? "token_hash=auth-otp-proof" : "code=pkce-code"}&next=https://evil.example`);
  if (withInvitation) request.cookies.set(INVITATION_CONTEXT_COOKIE, createInvitationContext(token, "auth-otp-proof"));
  return request;
}

describe("browser-bound invitation callback", () => {
  it.each(["activation", "login", "failure"])("keeps the configured public origin when Next uses an internal request hostname (%s)", async (flow) => {
    clients();
    const query = flow === "login" ? "code=pkce-code" : "token_hash=auth-otp-proof";
    const request = new NextRequest(`http://localhost:3000/auth/callback?${query}`);
    if (flow === "activation") request.cookies.set(INVITATION_CONTEXT_COOKIE, createInvitationContext(token, "auth-otp-proof"));
    const response = await GET(request);
    const path = flow === "failure" ? "/auth/invitation?error=activation_failed" : "/employee/payslips";
    expect(response.headers.get("location")).toBe(`https://paie.example.test${path}`);
  });

  it("verifies the user before accepting, clears the context, and redirects to payslips", async () => {
    const testClients = clients();
    const response = await GET(callbackRequest());
    expect(testClients.server.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "auth-otp-proof", type: "email" });
    expect(testClients.admin.rpc).toHaveBeenCalledWith("accept_employee_invitation", {
      p_auth_user_id: "auth-1",
      p_token_hash: hash,
    });
    expect(testClients.server.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(testClients.admin.rpc.mock.invocationCallOrder[0]);
    expect(response.headers.get("location")).toBe("https://paie.example.test/employee/payslips");
    expect(response.cookies.get(INVITATION_CONTEXT_COOKIE)?.value).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not accept an invalid email proof", async () => {
    const testClients = clients();
    testClients.server.auth.verifyOtp.mockResolvedValue({ error: { message: "invalid proof" } });
    const response = await GET(callbackRequest());
    expect(testClients.admin.rpc).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/invitation?error=activation_failed");
  });

  it("does not trust a session when getUser fails", async () => {
    const testClients = clients();
    testClients.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    await GET(callbackRequest());
    expect(testClients.admin.rpc).not.toHaveBeenCalled();
  });

  it("shows a recoverable failure when the invitation is expired, revoked or belongs to another user", async () => {
    const testClients = clients();
    testClients.admin.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    const response = await GET(callbackRequest());
    expect(response.headers.get("location")).toBe("https://paie.example.test/auth/invitation?error=activation_failed");
    expect(response.cookies.get(INVITATION_CONTEXT_COOKIE)?.value).toBe("");
  });


  it("does not consume the email proof without matching browser context", async () => {
    const testClients = clients();
    const request = new NextRequest("https://paie.example.test/auth/callback?token_hash=auth-otp-proof");
    await GET(request);
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
    request.cookies.set(INVITATION_CONTEXT_COOKIE, createInvitationContext(token, "other-proof"));
    await GET(request);
    expect(testClients.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects tampered and expired signed browser contexts", () => {
    const context = createInvitationContext(token, "auth-otp-proof");
    expect(readInvitationContext(`${context}x`, "auth-otp-proof")).toBeNull();
    expect(readInvitationContext(`${context.split(".")[0]}.${"é".repeat(43)}`, "auth-otp-proof")).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
    expect(readInvitationContext(context, "auth-otp-proof")).toBeNull();
    vi.restoreAllMocks();
  });

  it("preserves normal role-based login without invitation context", async () => {
    const testClients = clients();
    const response = await GET(callbackRequest(false));
    expect(response.headers.get("location")).toBe("https://paie.example.test/employee/payslips");
    expect(testClients.admin.rpc).not.toHaveBeenCalled();
  });
});
