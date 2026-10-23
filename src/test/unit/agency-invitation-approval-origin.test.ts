import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), manager: vi.fn(), invite: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/env.public", () => ({ getPublicSupabaseConfig: () => ({ appUrl: "https://salary.example.test/root" }) }));
vi.mock("@/lib/admin/auth", () => ({ getCurrentActor: mocks.actor, getCurrentAgencyScopedActor: mocks.manager }));
vi.mock("@/lib/employees/agency-invitations", () => ({ requestAgencyInvitations: mocks.invite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { POST as invite } from "@/app/api/manager/employees/invitations/route";
import { POST as approve } from "@/app/api/hr/imports/[importId]/departure-approval/route";
const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ importId: id }) };
function request(origin?: string) {
  return new Request("http://internal-next-server.local/api/action", { method: "POST", headers: { "content-type": "application/json", ...(origin !== undefined ? { origin } : {}) }, body: JSON.stringify({ confirmed: true, fingerprint: "a".repeat(32) }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.manager.mockResolvedValue({ id, agencyId: id, role: "agency_manager" });
  mocks.actor.mockResolvedValue({ id, role: "hr_central" });
  mocks.invite.mockResolvedValue({ sent: 1, failed: 0, skipped: 0, pending: 0 });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
describe("canonical origin guards on new invitation and HR payroll approval endpoints", () => {
  it.each([undefined, "null", "https://foreign.example.test", "https://salary.example.test.attacker.test", "https://salary.example.test/path", "http://salary.example.test"])("rejects %j before authentication or any mutation", async origin => {
    expect((await invite(request(origin))).status).toBe(403);
    expect((await approve(request(origin), context)).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.manager).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("accepts the exact configured public origin even when the internal request host differs", async () => {
    expect((await invite(request("https://salary.example.test"))).status).toBe(200);
    expect((await approve(request("https://salary.example.test"), context)).status).toBe(200);
    expect(mocks.invite).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("approve_departed_payroll", { p_actor_id: id, p_import_id: id, p_fingerprint: "a".repeat(32) });
  });
});
