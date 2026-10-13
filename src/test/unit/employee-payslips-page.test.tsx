import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const employeePayslipsMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: employeePayslipsMocks.redirect,
  notFound: employeePayslipsMocks.notFound,
  usePathname: () => "/employee/payslips",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: employeePayslipsMocks.createClient,
}));

const PROFILE_ID = "00000000-0000-0000-0000-000000000101";

describe("EmployeePayslipsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    employeePayslipsMocks.createClient.mockReset();
    employeePayslipsMocks.redirect.mockReset();
    employeePayslipsMocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    employeePayslipsMocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("redirects unauthenticated employees to login before loading payslips", async () => {
    const client = createEmployeePayslipClient({
      claimsSub: null,
      payslipRows: [],
      profile: null,
    });
    employeePayslipsMocks.createClient.mockResolvedValue(client);

    const { default: EmployeePayslipsPage } = await import("@/app/employee/payslips/page");

    await expect(Promise.resolve().then(() => EmployeePayslipsPage())).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
    expect(employeePayslipsMocks.redirect).toHaveBeenCalledWith("/auth/login");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("renders the current employee payslip returned by Supabase RLS", async () => {
    const client = createEmployeePayslipClient({
      claimsSub: "00000000-0000-0000-0000-000000000001",
      payslipRows: [
        {
          current_version: {
            id: "00000000-0000-0000-0000-000000000301",
            pay_items: [{ amount: 50000, category: "BENEFIT", label: "Prime transport" }],
            snapshot_data: {
              deductionsTotal: 250000,
              grossAmount: 1500000,
              netAmount: 1250000,
            },
          },
          employee: {
            employee_id: "EMP-001",
            full_name: "Rina Salary",
            id: "00000000-0000-0000-0000-000000000201",
            profile_id: PROFILE_ID,
          },
          id: "00000000-0000-0000-0000-000000000401",
          period_end: "2026-06-30",
          period_start: "2026-06-01",
          published_at: "2026-06-30T08:00:00.000Z",
        },
      ],
      profile: { id: PROFILE_ID, role: "employee" },
    });
    employeePayslipsMocks.createClient.mockResolvedValue(client);

    const { default: EmployeePayslipsPage } = await import("@/app/employee/payslips/page");

    render(await EmployeePayslipsPage());

    expect(client.from).toHaveBeenCalledWith("payslips");
    expect(client.payslipsQuery.eq).toHaveBeenCalledWith("employee.profile_id", PROFILE_ID);
    expect(screen.getByRole("heading", { name: "Rina Salary" })).toBeTruthy();
    expect(screen.getAllByText("2026-06-01 - 2026-06-30")).toHaveLength(2);
    expect(screen.getByText("Prime transport")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Télécharger CSV/ }).getAttribute("href")).toBe(
      "/api/employee/payslips/export",
    );
    expect(screen.getByRole("heading", { name: "Historique publié" })).toBeTruthy();
  });

  it("does not expose payslips to non-employee roles through the employee route", async () => {
    const client = createEmployeePayslipClient({
      claimsSub: "00000000-0000-0000-0000-000000000001",
      payslipRows: [],
      profile: { id: PROFILE_ID, role: "hr_central" },
    });
    employeePayslipsMocks.createClient.mockResolvedValue(client);

    const { default: EmployeePayslipsPage } = await import("@/app/employee/payslips/page");

    render(await EmployeePayslipsPage());

    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(client.from).not.toHaveBeenCalledWith("payslips");
  });

  it("opens a prior period's current published version and marks the selected history link", async () => {
    const client = createEmployeePayslipClient({
      claimsSub: "auth-id",
      profile: { id: PROFILE_ID, role: "employee" },
      payslipRows: [publishedRow("latest", "2026-06-01", "June allowance"), publishedRow("earlier", "2026-05-01", "May allowance")],
    });
    employeePayslipsMocks.createClient.mockResolvedValue(client);
    const { default: Page } = await import("@/app/employee/payslips/page");
    render(await Page({ searchParams: Promise.resolve({ payslip: "earlier" }) }));
    expect(screen.getByText("May allowance")).toBeTruthy();
    expect(screen.queryByText("June allowance")).toBeNull();
    expect(screen.getByRole("link", { name: /2026-05-01/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Télécharger PDF" }).getAttribute("href")).toBe("/api/employee/payslips/earlier/pdf");
    expect(client.payslipsQuery.not).toHaveBeenCalledWith("current_version_id", "is", null);
    expect(client.payslipsQuery.or).toHaveBeenCalledWith(expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-/));
    expect(client.payslipsQuery.select.mock.calls[0][0]).toContain("payslips_current_version_fk");
  });

  it("returns not found for an inaccessible selection without falling back to another payslip", async () => {
    employeePayslipsMocks.createClient.mockResolvedValue(createEmployeePayslipClient({
      claimsSub: "auth-id",
      profile: { id: PROFILE_ID, role: "employee" },
      payslipRows: [publishedRow("owned", "2026-06-01", "Private allowance")],
    }));
    const { default: Page } = await import("@/app/employee/payslips/page");
    await expect(Page({ searchParams: Promise.resolve({ payslip: "someone-else" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails closed if an unexpected foreign employee row is returned", async () => {
    const foreignRow = publishedRow("foreign", "2026-06-01", "Foreign allowance");
    foreignRow.employee.profile_id = "other-profile";
    employeePayslipsMocks.createClient.mockResolvedValue(createEmployeePayslipClient({
      claimsSub: "auth-id", profile: { id: PROFILE_ID, role: "employee" }, payslipRows: [foreignRow],
    }));
    const { default: Page } = await import("@/app/employee/payslips/page");
    render(await Page());
    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(screen.queryByText("Foreign allowance")).toBeNull();
  });
});

function publishedRow(id: string, start: string, label: string) {
  return {
    id, period_start: start, period_end: start.replace("-01", "-28"), published_at: `${start}T08:00:00Z`,
    employee: { full_name: "Rina Salary", profile_id: PROFILE_ID },
    current_version: {
      id: `${id}-current`,
      pay_items: [{ amount: 1000, category: "BENEFIT", label }],
      snapshot_data: { grossAmount: 1500000, deductionsTotal: 250000, netAmount: 1250000 },
    },
  };
}

function createEmployeePayslipClient(input: {
  claimsSub: string | null;
  payslipRows: unknown[];
  profile: { id: string; role: string } | null;
}) {
  const profileQuery = {
    eq: vi.fn(() => profileQuery),
    select: vi.fn(() => profileQuery),
    single: vi.fn(async () => ({ data: input.profile, error: input.profile ? null : {} })),
  };
  const payslipResult = Promise.resolve({ data: input.payslipRows, error: null });
  const payslipsQuery = {
    eq: vi.fn(() => payslipsQuery),
    limit: vi.fn(() => payslipsQuery),
    not: vi.fn(() => payslipsQuery),
    or: vi.fn(() => payslipsQuery),
    order: vi.fn(() => payslipsQuery),
    select: vi.fn((...args: string[]) => { void args; return payslipsQuery; }),
    then: payslipResult.then.bind(payslipResult),
  };

  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: input.claimsSub ? { sub: input.claimsSub } : {} },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "payslips") return payslipsQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
    payslipsQuery,
    profileQuery,
  };
}
