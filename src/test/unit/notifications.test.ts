import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/notifications/test/route";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));

function createSupabaseClientWithUser(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
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
});

describe("GET /api/notifications/test", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
  });

  it("returns 401 and UNAUTHORIZED for unauthenticated requests", async () => {
    supabaseMocks.createClient.mockResolvedValue(createSupabaseClientWithUser(null));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns a sample notification email for authenticated requests", async () => {
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
});
