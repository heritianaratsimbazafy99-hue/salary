import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/employees/linking", () => ({}));
vi.mock("@/lib/notifications/resend-server", () => ({}));
import { isPayrollEmailDeliveryAllowed } from "@/lib/payroll/publish";

describe("payroll delivery during an approved identity correction", () => {
  it("permits an unchanged verified official address before the new address is proven", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await isPayrollEmailDeliveryAllowed({ rpc }, "agency", "official@example.test")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("payroll_email_delivery_allowed", { p_agency_id: "agency", p_email: "official@example.test" });
  });
  it("defers old mailbox delivery when Auth has proven the new address", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await isPayrollEmailDeliveryAllowed({ rpc }, "agency", "old@example.test")).toBe(false);
  });
  it.each([null, {}, "true", [{ allowed: true }]])("fails closed for malformed proof %j", async data => {
    expect(await isPayrollEmailDeliveryAllowed({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }, "agency", "old@example.test")).toBe(false);
  });
  it("fails closed when the protected Auth lookup fails or the network is unavailable", async () => {
    expect(await isPayrollEmailDeliveryAllowed({ rpc: vi.fn().mockResolvedValue({ data: true, error: { code: "42501" } }) }, "agency", "old@example.test")).toBe(false);
    expect(await isPayrollEmailDeliveryAllowed({ rpc: vi.fn().mockRejectedValue(new Error("network")) }, "agency", "old@example.test")).toBe(false);
  });
});
