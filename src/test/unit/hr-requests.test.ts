import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const EMPLOYEE = "00000000-0000-4000-8000-0000000000c1";
const REQUEST = "00000000-0000-4000-8000-0000000000d1";
function serverClient(role: string) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
  };
}

describe("HR requests", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["team_manager", "client_viewer", "agency_manager"])("refuses a request opened by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { createRequest } = await import("../../lib/hr/requests");
    await expect(createRequest({ employeeId: EMPLOYEE, category: "PAYROLL", subject: "Sujet", message: "Message" })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["team_manager", "client_viewer", "employee"])("refuses a reply by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { replyRequest } = await import("../../lib/hr/requests");
    await expect(replyRequest({ requestId: REQUEST, reply: "Ok", status: "RESOLVED", revision: "1" })).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("validates the request and the reply status before calling the database", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const { createRequest, replyRequest } = await import("../../lib/hr/requests");
    await expect(createRequest({ employeeId: EMPLOYEE, category: "SALARY", subject: "Sujet", message: "Message" })).rejects.toThrow(/catégorie/);
    await expect(replyRequest({ requestId: REQUEST, reply: "Ok", status: "OPEN", revision: "1" })).rejects.toThrow(/réponse/);
    await expect(replyRequest({ requestId: REQUEST, reply: " ", status: "RESOLVED", revision: "1" })).rejects.toThrow(/réponse/);
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("sends a reply with its expected revision", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("super_admin"));
    const admin = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { replyRequest } = await import("../../lib/hr/requests");
    await replyRequest({ requestId: REQUEST, reply: " Réglé ", status: "RESOLVED", revision: "4" });
    expect(admin.rpc).toHaveBeenCalledWith("hr_reply_request", expect.objectContaining({ p_reply: "Réglé", p_status: "RESOLVED", p_revision: 4 }));
  });
});
