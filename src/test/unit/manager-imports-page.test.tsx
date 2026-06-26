import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const managerImportsPageMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentAgencyScopedActor: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: managerImportsPageMocks.redirect,
}));

vi.mock("@/lib/admin/auth", () => ({
  getCurrentAgencyScopedActor: managerImportsPageMocks.getCurrentAgencyScopedActor,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: managerImportsPageMocks.createClient,
}));

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const MANAGER_ID = "00000000-0000-0000-0000-000000000201";
const IMPORT_ID = "00000000-0000-0000-0000-000000000301";

describe("ManagerImportsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    managerImportsPageMocks.createClient.mockReset();
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockReset();
    managerImportsPageMocks.redirect.mockReset();
    managerImportsPageMocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("redirects anonymous users before loading manager imports", async () => {
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockRejectedValue(
      new Error("Authentification requise."),
    );

    const { default: ManagerImportsPage } = await import("@/app/manager/imports/page");

    await expect(Promise.resolve().then(() => ManagerImportsPage())).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
    expect(managerImportsPageMocks.createClient).not.toHaveBeenCalled();
  });

  it("renders a forbidden state for non-manager roles without loading imports", async () => {
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockResolvedValue({
      agencyId: AGENCY_ID,
      id: MANAGER_ID,
      role: "employee",
    });

    const { default: ManagerImportsPage } = await import("@/app/manager/imports/page");

    render(await ManagerImportsPage());

    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(managerImportsPageMocks.createClient).not.toHaveBeenCalled();
  });

  it("renders a functional upload form scoped to the manager agency", async () => {
    const client = createManagerImportsClient({
      importRows: [
        {
          created_at: "2026-06-26T08:00:00.000Z",
          id: IMPORT_ID,
          invalid_row_count: 1,
          period_end: "2026-06-30",
          period_start: "2026-06-01",
          source_filename: "paie-juin.xlsx",
          status: "READY_FOR_PREVIEW",
          unknown_employee_count: 0,
          valid_row_count: 12,
        },
      ],
    });
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockResolvedValue({
      agencyId: AGENCY_ID,
      id: MANAGER_ID,
      role: "agency_manager",
    });
    managerImportsPageMocks.createClient.mockResolvedValue(client);

    const { default: ManagerImportsPage } = await import("@/app/manager/imports/page");

    const { container } = render(await ManagerImportsPage());

    expect(client.from).toHaveBeenCalledWith("payroll_imports");
    expect(client.importsQuery.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID);
    const form = container.querySelector('form[action="/api/imports"][method="post"]');
    const agencyInput = container.querySelector<HTMLInputElement>('input[name="agencyId"]');
    expect(form).toBeTruthy();
    expect(agencyInput?.value).toBe(AGENCY_ID);
    expect(screen.getByRole("heading", { name: "Imports de paie" })).toBeTruthy();
    expect(screen.getByText(/paie-juin\.xlsx/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ouvrir/ }).getAttribute("href")).toBe(
      `/manager/imports/${IMPORT_ID}`,
    );
  });
});

describe("ManagerImportDetailPage", () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    managerImportsPageMocks.createClient.mockReset();
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockReset();
    managerImportsPageMocks.redirect.mockReset();
    managerImportsPageMocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("loads the requested import report through Supabase and shows publish action when ready", async () => {
    const client = createManagerImportsClient({
      errors: [
        {
          field_name: "grossAmount",
          message: "Montant brut invalide",
          row_number: 4,
        },
      ],
      importRecord: {
        agency_id: AGENCY_ID,
        id: IMPORT_ID,
        invalid_row_count: 1,
        period_end: "2026-06-30",
        period_start: "2026-06-01",
        source_filename: "paie-juin.xlsx",
        status: "READY_FOR_PREVIEW",
        unknown_employee_count: 0,
        valid_row_count: 12,
      },
      previewRows: [
        {
          employee_id: "EMP-001",
          employee_name: "Rina Salary",
          has_manual_adjustments: false,
          id: "00000000-0000-0000-0000-000000000401",
          normalized_data: {
            deductionsTotal: 250000,
            grossAmount: 1500000,
            netAmount: 1250000,
          },
        },
      ],
    });
    managerImportsPageMocks.getCurrentAgencyScopedActor.mockResolvedValue({
      agencyId: AGENCY_ID,
      id: MANAGER_ID,
      role: "agency_manager",
    });
    managerImportsPageMocks.createClient.mockResolvedValue(client);

    const { default: ManagerImportDetailPage } = await import("@/app/manager/imports/[importId]/page");

    render(await ManagerImportDetailPage({ params: Promise.resolve({ importId: IMPORT_ID }) }));

    expect(client.from).toHaveBeenCalledWith("payroll_imports");
    expect(client.from).toHaveBeenCalledWith("payroll_import_errors");
    expect(client.from).toHaveBeenCalledWith("payroll_import_rows");
    expect(client.importDetailQuery.eq).toHaveBeenCalledWith("id", IMPORT_ID);
    expect(client.importDetailQuery.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID);
    expect(client.errorsQuery.eq).toHaveBeenCalledWith("import_id", IMPORT_ID);
    expect(client.rowsQuery.eq).toHaveBeenCalledWith("import_id", IMPORT_ID);
    expect(client.rowsQuery.eq).toHaveBeenCalledWith("agency_id", AGENCY_ID);
    expect(screen.getByRole("heading", { name: "Rapport d'import" })).toBeTruthy();
    expect(screen.getByText(/paie-juin\.xlsx/)).toBeTruthy();
    expect(screen.getByText("Montant brut invalide")).toBeTruthy();
    expect(screen.getByText("Rina Salary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publier" })).toBeTruthy();
  });
});

function createManagerImportsClient(input: {
  errors?: unknown[];
  importRecord?: unknown;
  importRows?: unknown[];
  previewRows?: unknown[];
}) {
  const importsQuery = createRowsQuery(input.importRows ?? []);
  const importDetailQuery = createSingleQuery(input.importRecord ?? null);
  const errorsQuery = createRowsQuery(input.errors ?? []);
  const rowsQuery = createRowsQuery(input.previewRows ?? []);

  return {
    errorsQuery,
    from: vi.fn((table: string) => {
      if (table === "payroll_imports") {
        return input.importRecord ? importDetailQuery : importsQuery;
      }

      if (table === "payroll_import_errors") return errorsQuery;
      if (table === "payroll_import_rows") return rowsQuery;

      throw new Error(`Unexpected table ${table}`);
    }),
    importDetailQuery,
    importsQuery,
    rowsQuery,
  };
}

function createRowsQuery(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null });
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    then: result.then.bind(result),
  };

  return query;
}

function createSingleQuery(row: unknown) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: row,
      error: row ? null : { code: "PGRST116" },
    })),
  };

  return query;
}
