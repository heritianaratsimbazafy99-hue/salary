import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { PdfExportError } from "@/lib/payslips/pdf";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), loadEmployeePayslips: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/payslips/employee", () => ({ loadEmployeePayslips: mocks.loadEmployeePayslips }));
vi.mock("@/lib/payslips/pdf", () => ({ PdfExportError: class extends Error {}, renderEmployeePayslipPdf: mocks.render }));

import { GET } from "@/app/api/employee/payslips/[payslipId]/pdf/route";

const payslip = { id: "owned-id", periodStart: "2026-06-01" };
const request = new Request("https://salary.example/api/employee/payslips/owned-id/pdf");
const context = (payslipId: string) => ({ params: Promise.resolve({ payslipId }) });

describe("employee PDF access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.loadEmployeePayslips.mockResolvedValue([payslip]);
    mocks.render.mockResolvedValue(new TextEncoder().encode("%PDF-1.7"));
  });

  it("exports the authenticated employee's selected published version privately", async () => {
    const response = await GET(request, context("owned-id"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("2026-06-01.pdf");
    expect(await response.text()).toBe("%PDF-1.7");
    expect(mocks.render).toHaveBeenCalledWith(payslip);
  });

  it.each(["other-employee-id", "unpublished-id", "unknown-id"])("does not disclose %s", async (id) => {
    const response = await GET(request, context(id));
    expect(response.status).toBe(404);
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("returns a useful validation message when a document cannot be rendered", async () => {
    mocks.render.mockRejectedValue(new PdfExportError("Utilisez le CSV pour cette fiche."));
    const response = await GET(request, context("owned-id"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "Utilisez le CSV pour cette fiche." } });
  });

  it.each([[AUTH_REQUIRED_ERROR_MESSAGE, 401], [FORBIDDEN_ERROR_MESSAGE, 403], ["Database offline", 500]])(
    "denies PDF access for %s", async (message, status) => {
      mocks.loadEmployeePayslips.mockRejectedValue(new Error(String(message)));
      expect((await GET(request, context("owned-id"))).status).toBe(status);
      expect(mocks.render).not.toHaveBeenCalled();
    },
  );
});
