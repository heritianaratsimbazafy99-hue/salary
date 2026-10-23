import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), profile: vi.fn(), updateUser: vi.fn(), send: vi.fn(), actor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ requireCanManageHrReferential: m.actor }));
vi.mock("@/lib/env.public", () => ({ getPublicSupabaseConfig: () => ({ appUrl: "https://salary.example.test" }) }));
vi.mock("@/lib/notifications/resend-server", () => ({ sendHrNotificationEmail: m.send }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: m.rpc, from: () => ({ select: () => ({ eq: () => ({ single: m.profile }) }) }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.getUser, updateUser: m.updateUser } }) }));
import { confirmUnlinkedEmailChange, finishOwnEmailChange, hashEmailChangeToken, isEmailChangeToken, requestUnlinkedEmailVerification, startOwnEmailChange } from "@/lib/employees/identity-change";
const request = "c1100000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); m.actor.mockResolvedValue({ id: "hr" }); m.getUser.mockResolvedValue({ data: { user: { id: "auth-owner" } }, error: null }); m.profile.mockResolvedValue({ data: { id: "owner", role: "employee", is_active: true }, error: null }); m.updateUser.mockResolvedValue({ error: null }); m.send.mockResolvedValue({ error: null }); });
describe("verified employee email changes", () => {
  it("hashes opaque proofs and rejects malformed bearer tokens", () => { const token = "a".repeat(43); expect(isEmailChangeToken(token)).toBe(true); expect(isEmailChangeToken(token + "?leak")).toBe(false); expect(hashEmailChangeToken(token)).toMatch(/^[a-f0-9]{64}$/); expect(hashEmailChangeToken(token)).not.toContain(token); });
  it("only calls owner Auth update after DB eligibility succeeds", async () => {
    m.rpc.mockResolvedValue({ data: { email: "new@example.test", linked: true, attemptId: request }, error: null });
    await startOwnEmailChange(request);
    expect(m.rpc).toHaveBeenCalledWith("begin_employee_email_change", { p_request_id: request, p_actor_id: "owner" });
    expect(m.updateUser).toHaveBeenCalledWith({ email: "new@example.test" }, { emailRedirectTo: "https://salary.example.test/auth/email-change/callback" });
    expect(m.rpc).toHaveBeenCalledWith("settle_employee_email_change", { p_actor_id: "owner", p_request_id: request, p_attempt_id: request });
  });
  it("blocks multi-employment before touching Auth", async () => { m.rpc.mockResolvedValue({ error: { code: "PT409", message: "multi_employment_hr_arbitration" } }); await expect(startOwnEmailChange(request)).rejects.toThrow("plusieurs emplois"); expect(m.updateUser).not.toHaveBeenCalled(); });
  it("retains pending state on Auth delivery failure", async () => { m.rpc.mockResolvedValue({ data: { email: "new@example.test", linked: true, attemptId: request }, error: null }); m.updateUser.mockResolvedValue({ error: { message: "network" } }); await expect(startOwnEmailChange(request)).rejects.toThrow("indéterminé"); expect(m.rpc).toHaveBeenCalledTimes(1); });
  it("never retries an indeterminate Auth operation", async () => { m.rpc.mockResolvedValue({ error: { code: "PT409", message: "auth_outcome_unknown" } }); await expect(startOwnEmailChange(request)).rejects.toThrow("indéterminé"); expect(m.updateUser).not.toHaveBeenCalled(); });
  it("binds completion to authenticated owner, not a submitted user ID", async () => { m.rpc.mockResolvedValue({ data: true, error: null }); await finishOwnEmailChange(request); expect(m.rpc).toHaveBeenCalledWith("complete_employee_email_change", { p_request_id: request, p_auth_user_id: "auth-owner" }); });
  it("sends unlinked proof only after approval RPC; never persists raw token", async () => {
    m.rpc.mockResolvedValue({ data: { email: "new@example.test", linked: false }, error: null }); await requestUnlinkedEmailVerification(request);
    const args = m.rpc.mock.calls[0][1]; expect(args.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    const mail = m.send.mock.calls[0][0]; expect(mail.to).toBe("new@example.test"); expect(mail.html).toContain("/auth/email-change#request="); expect(mail.html).not.toContain("?token="); expect(mail.idempotencyKey).not.toContain("new@example.test");
  });
  it("never sends an email or consumes invalid input", async () => { await expect(requestUnlinkedEmailVerification("invalid")).rejects.toThrow(); await expect(confirmUnlinkedEmailChange(request, "short")).rejects.toThrow(); expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); });
  it("reports pending proof instead of success", async () => { m.rpc.mockResolvedValue({ error: { message: "verification_pending", code: "PT409" } }); await expect(finishOwnEmailChange(request)).rejects.toThrow("encore en attente"); });
});
