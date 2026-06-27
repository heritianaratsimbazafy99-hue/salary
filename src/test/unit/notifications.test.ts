import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/notifications/test/route";
import * as resendNotifications from "@/lib/notifications/resend";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

function createSupabaseClientWithUser(user: { id: string } | null, role: string | null = "hr_central") {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: role ? { role } : null,
            error: role ? null : { code: "PGRST116" },
          })),
        })),
      })),
    })),
  };
}

describe("buildPayslipPublishedEmail", () => {
  it("does not include payroll amounts", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "Employee One",
      appUrl: "https://example.com",
    });

    expect(email.subject).toContain("fiche de paie");
    expect(email.html).toContain("Employee One");
    expect(email.html).not.toMatch(/\d+\s*MGA/);
  });

  it("escapes employee names in HTML", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "<script>alert('xss')</script>",
      appUrl: "https://example.com",
    });

    expect(email.html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("falls back to a safe payslip link for invalid app URLs", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "Employee One",
      appUrl: "javascript:alert(1)",
    });

    expect(email.html).toContain('href="http://localhost:3000/employee/payslips"');
    expect(email.html).not.toContain("javascript:");
  });

  it("falls back for non-local HTTP app URLs", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "Employee One",
      appUrl: "http://evil.example.com",
    });

    expect(email.html).toContain('href="http://localhost:3000/employee/payslips"');
    expect(email.html).not.toContain("evil.example.com");
  });

  it("allows local HTTP app URLs for development", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "Employee One",
      appUrl: "http://localhost:3000",
    });

    expect(email.html).toContain('href="http://localhost:3000/employee/payslips"');
  });

  it("keeps server email sending out of the template module", () => {
    expect(resendNotifications).not.toHaveProperty("sendPayslipPublishedEmail");
  });
});

describe("GET /api/notifications/test", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(createSupabaseClientWithUser(null));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 403 and FORBIDDEN for authenticated non-HR requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }, "employee"),
    );

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns a sample notification email for authenticated HR requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(
      createSupabaseClientWithUser({ id: "00000000-0000-0000-0000-000000000001" }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        subject: expect.stringContaining("fiche de paie"),
        html: expect.stringContaining("Exemple"),
      },
    });
  });

  it("returns 404 in production before touching Supabase", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });
});
