import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const employeePayslipsMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: employeePayslipsMocks.redirect,
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
    expect(screen.getByText("2026-06-01 - 2026-06-30")).toBeTruthy();
    expect(screen.getByText("Prime transport")).toBeTruthy();
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
});

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
    order: vi.fn(() => payslipsQuery),
    select: vi.fn(() => payslipsQuery),
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
