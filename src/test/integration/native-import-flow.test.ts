// @vitest-environment node
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { persistPayrollImport } from "@/lib/payroll/import-service";

type Row = Record<string, unknown>;
type NativeFormat = "airtel" | "huawei";
const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_AGENCY_ID = "00000000-0000-0000-0000-000000000102";
const IMPORT_ID = "00000000-0000-0000-0000-000000000301";
const PERIOD = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

const FORMAT = {
  airtel: {
    sheet: "Recap global", extension: "xlsx", id: "MATRICULE", name: "NAME", net: "SALAIRE NET",
    row: { NAME: "Synthetic Employee", MATRICULE: "TEST-001", "SALAIRE DE BASE": 1000,
      "SALAIRE BRUT": 1200, "SALAIRE NET": 1125, "CNAPS 1%": 12, "OSTIE 1%": 12,
      IRSA: 30, "DEDUCTION AVANCE": 25, "BONUS": 200, "JOURS TRAVAILLES": 22 },
    detail: { label: "BONUS", category: "OTHER_ELEMENTS", amount: 200 },
    informational: { label: "JOURS TRAVAILLES", category: "INFORMATIONAL_NOTE", text: "22" },
  },
  huawei: {
    sheet: "SEPTEMBER 2026", extension: "xls", id: "ID", name: "HRMS OFFICAL NAME", net: "NP2",
    row: { ID: "TEST-001", "HRMS OFFICAL NAME": "Synthetic Employee", "ACTUAL BASIC SALARY": 1000,
      "TOTAL OF GROSS SALARY": 1200, "NET PAY": 1121, NP2: 1141, "CNAPS Employee 1%": 12,
      "OSTIE Employee 1%": 12, "Individual Income Tax IRSA": 30, "CASH ADVANCE": 25,
      "TRANSPORT ALLOWANCE": 200, "DAYS WORKED": 22 },
    detail: { label: "TRANSPORT ALLOWANCE", category: "OTHER_ELEMENTS", amount: 200 },
    informational: { label: "DAYS WORKED", category: "INFORMATIONAL_NOTE", text: "22" },
  },
} satisfies Record<NativeFormat, { sheet: string; extension: string; id: string; name: string; net: string; row: Row; detail: Row; informational: Row }>;

function nativeFile(format: NativeFormat, overrides: Row[] = [{}], invalidCache = false) {
  const spec = FORMAT[format];
  const rows: Row[] = overrides.map((row) => ({ ...spec.row, ...row }));
  const headers = [...new Set(rows.flatMap(Object.keys))];
  const sheet = XLSX.utils.aoa_to_sheet([
    ["SYNTHETIC TEST PAYROLL"], [], [], [], headers,
    ...rows.flatMap((row, index) => [headers.map((header) => row[header]), ...(index < rows.length - 1 ? [[]] : [])]),
    headers.map((header) => header === spec.name ? "TOTAL" : header === spec.net ? 999999 : null),
  ]);
  if (invalidCache) {
    sheet[XLSX.utils.encode_cell({ r: 5, c: headers.indexOf(spec.net) })] = { t: "e", v: 7, f: "1/0" };
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, spec.sheet);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["ANNEX", "DO NOT IMPORT"], ["TEST-099", 777]]), "Annex");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: spec.extension === "xls" ? "biff8" : "xlsx" });
  if (format === "huawei") expect([...bytes.subarray(0, 8)]).toEqual([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return new File([bytes], `synthetic-${format}.${spec.extension}`, {
    type: format === "huawei" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function employee(overrides: Row = {}): Row {
  return { agency_id: AGENCY_ID, employee_id: "TEST-001", email: "synthetic@example.test", is_active: true, ...overrides };
}

function database(employees: Row[]) {
  const tables: Record<string, Row[]> = {
    employees, column_mappings: [], payroll_imports: [], payroll_import_rows: [], payroll_import_errors: [],
  };
  const rpc = vi.fn(() => { throw new Error("Import must never publish"); });
  const from = vi.fn((table: string) => {
    if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected table mutation: ${table}`);
    return {
      insert(payload: Row | Row[]) {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row, id: IMPORT_ID }));
        tables[table].push(...inserted);
        const result = Promise.resolve({ data: null, error: null });
        return { then: result.then.bind(result), select: () => ({ single: async () => ({ data: inserted[0], error: null }) }) };
      },
      select() {
        const filters: Array<(row: Row) => boolean> = [];
        const query = {
          eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
          in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return query; },
          then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: tables[table].filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };
  });
  return { tables, client: { from, rpc } };
}

async function runImport(format: NativeFormat, employees: Row[], rows?: Row[], invalidCache = false) {
  const initialEmployees = structuredClone(employees);
  const { tables, client } = database(employees);
  const summary = await persistPayrollImport({
    actor: { agencyId: AGENCY_ID, id: "00000000-0000-0000-0000-000000000201", role: "agency_manager" },
    agencyId: AGENCY_ID, ...PERIOD, file: nativeFile(format, rows, invalidCache),
    supabase: client as unknown as Parameters<typeof persistPayrollImport>[0]["supabase"],
  });
  expect(client.rpc).not.toHaveBeenCalled();
  expect(tables.employees).toEqual(initialEmployees);
  return { summary, tables };
}

describe.each<NativeFormat>(["airtel", "huawei"])("native %s import persistence", (format) => {
  it("resolves missing email by canonical matricule within the agency and preserves native details without mappings", async () => {
    const spec = FORMAT[format];
    const { summary, tables } = await runImport(format, [
      employee(),
      employee({ agency_id: OTHER_AGENCY_ID, email: "other-agency@example.test" }),
    ], [{ [spec.id]: " test-001 " }]);
    expect(summary).toMatchObject({ status: "READY_FOR_PREVIEW", rowCount: 1, validRowCount: 1, invalidRowCount: 0, unknownEmployeeCount: 0, unknownColumns: [] });
    expect(tables.payroll_import_errors).toEqual([]);
    expect(tables.payroll_import_rows).toHaveLength(1);
    expect(tables.payroll_import_rows[0]).toMatchObject({
      agency_id: AGENCY_ID, employee_id: "TEST-001", employee_email: "synthetic@example.test",
      normalized_data: { grossAmount: 1200, deductionsTotal: 79, netAmount: format === "airtel" ? 1125 : 1141, ...PERIOD },
      raw_unknown_columns: {},
      pay_items: expect.arrayContaining([expect.objectContaining(spec.detail), expect.objectContaining(spec.informational)]),
    });
    expect(tables.column_mappings).toEqual([]);
  });

  it("rejects unknown matricules without email even when another agency has that identity", async () => {
    const { summary, tables } = await runImport(format, [employee({ agency_id: OTHER_AGENCY_ID })]);
    expect(summary).toMatchObject({ status: "FAILED", validRowCount: 0, invalidRowCount: 1 });
    expect(tables.payroll_import_rows).toEqual([]);
    expect(tables.payroll_import_errors).toEqual(expect.arrayContaining([expect.objectContaining({
      row_number: 6, field_name: "email", message: expect.stringMatching(/dossier RH.*cette agence.*colonne email/),
    })]));
  });

  it("accepts a new employee only when an explicit valid email is present", async () => {
    const { summary, tables } = await runImport(format, [], [{ email: "new-synthetic@example.test" }]);
    expect(summary).toMatchObject({ status: "READY_FOR_PREVIEW", unknownEmployeeCount: 1, validRowCount: 1 });
    expect(tables.payroll_import_rows[0]).toMatchObject({ employee_email: "new-synthetic@example.test" });
    expect(tables.employees).toEqual([]);
  });

  it("rejects duplicate canonical matricules and records the original source row numbers", async () => {
    const { summary, tables } = await runImport(format, [employee()], [{}, { [FORMAT[format].id]: " test-001 " }]);
    expect(summary).toMatchObject({ status: "FAILED", invalidRowCount: 2, validRowCount: 0 });
    expect(tables.payroll_import_rows).toEqual([]);
    expect(tables.payroll_import_errors.map((row) => row.row_number)).toEqual([6, 8]);
    expect(tables.payroll_import_errors.every((row) => row.error_code === "IDENTITY_CONFLICT")).toBe(true);
  });

  it("rejects inactive employees instead of restoring their access", async () => {
    const { summary, tables } = await runImport(format, [employee({ is_active: false })]);
    expect(summary).toMatchObject({ status: "FAILED", invalidRowCount: 1 });
    expect(tables.payroll_import_rows).toEqual([]);
    expect(tables.payroll_import_errors[0]).toMatchObject({ error_code: "IDENTITY_CONFLICT", message: expect.stringMatching(/désactivé/) });
  });

  it("rejects explicit email mismatches instead of silently replacing the supplied address", async () => {
    const { summary, tables } = await runImport(format, [employee()], [{ email: "incorrect@example.test" }]);
    expect(summary).toMatchObject({ status: "FAILED", invalidRowCount: 1 });
    expect(tables.payroll_import_rows).toEqual([]);
    expect(tables.payroll_import_errors[0]).toMatchObject({ error_code: "IDENTITY_CONFLICT", message: expect.stringMatching(/diffère du dossier/) });
  });

  it("persists an actionable cached Excel error against the original source row", async () => {
    const { summary, tables } = await runImport(format, [employee()], undefined, true);
    expect(summary).toMatchObject({ status: "FAILED", invalidRowCount: 1, validRowCount: 0 });
    expect(tables.payroll_import_rows).toEqual([]);
    expect(tables.payroll_import_errors).toEqual(expect.arrayContaining([expect.objectContaining({
      row_number: 6, error_code: "EXCEL_VALUE_UNAVAILABLE", message: expect.stringMatching(/Recalculez et enregistrez/),
    })]));
  });
});
