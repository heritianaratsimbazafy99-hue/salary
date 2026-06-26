import { describe, expect, it } from "vitest";

import { resolveImportColumnMappings } from "@/lib/payroll/mapping-resolution";

const AGENCY_ID = "00000000-0000-0000-0000-000000000101";
const OTHER_AGENCY_ID = "00000000-0000-0000-0000-000000000202";
const ACTOR_PROFILE_ID = "00000000-0000-0000-0000-000000000301";
const IMPORT_ID = "00000000-0000-0000-0000-000000000401";

type MappingTableRow = Record<string, unknown>;

type MappingTestDb = {
  column_mappings: MappingTableRow[];
  payroll_import_rows: MappingTableRow[];
  payroll_imports: MappingTableRow[];
};

type MappingClient = Parameters<typeof resolveImportColumnMappings>[0]["readSupabase"];

function createMappingDb(): MappingTestDb {
  return {
    column_mappings: [],
    payroll_import_rows: [],
    payroll_imports: [],
  };
}

function createMappingClient(db: MappingTestDb) {
  return {
    from: (table: keyof MappingTestDb) => createTableQuery(db, table),
  };
}

function createTableQuery(db: MappingTestDb, table: keyof MappingTestDb) {
  return {
    select() {
      return createSelectQuery(db[table]);
    },
    update(payload: MappingTableRow) {
      return createUpdateQuery(db[table], payload);
    },
    upsert(payload: MappingTableRow[], options?: { onConflict?: string }) {
      const conflictColumns = options?.onConflict?.split(",").map((column) => column.trim()) ?? [];

      payload.forEach((row) => {
        const existingRow = db[table].find(
          (candidate) =>
            conflictColumns.length > 0 &&
            conflictColumns.every((column) => candidate[column] === row[column]),
        );

        if (existingRow) {
          Object.assign(existingRow, row);
          return;
        }

        db[table].push({
          ...row,
          id: `00000000-0000-0000-0000-90000000000${db[table].length + 1}`,
        });
      });

      return Promise.resolve({ data: null, error: null });
    },
  };
}

function createSelectQuery(rows: MappingTableRow[]) {
  const filters: Array<(row: MappingTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    single: async () => {
      const row = filteredRows()[0];
      return {
        data: row ?? null,
        error: row ? null : { code: "PGRST116", message: "No rows" },
      };
    },
    then(resolve: (value: { data: MappingTableRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: filteredRows(), error: null }).then(resolve, reject);
    },
  };

  function filteredRows() {
    return rows.filter((row) => filters.every((filter) => filter(row)));
  }

  return query;
}

function createUpdateQuery(rows: MappingTableRow[], payload: MappingTableRow) {
  const filters: Array<(row: MappingTableRow) => boolean> = [];

  const query = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    then(resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      rows.filter((row) => filters.every((filter) => filter(row))).forEach((row) => {
        Object.assign(row, payload);
      });
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };

  return query;
}

describe("resolveImportColumnMappings", () => {
  it("stores mappings, recalculates pay items, and marks the import ready", async () => {
    const db = createMappingDb();
    db.payroll_imports.push({
      agency_id: AGENCY_ID,
      id: IMPORT_ID,
      status: "NEEDS_MAPPING",
    });
    db.payroll_import_rows.push({
      agency_id: AGENCY_ID,
      id: "00000000-0000-0000-0000-000000000501",
      import_id: IMPORT_ID,
      pay_items: [],
      raw_unknown_columns: {
        cafeteria: 2500,
        note_interne: "Avance soldee",
      },
    });

    const client = createMappingClient(db) as unknown as MappingClient;

    const result = await resolveImportColumnMappings({
      actor: {
        agencyId: AGENCY_ID,
        id: ACTOR_PROFILE_ID,
        role: "agency_manager",
      },
      importId: IMPORT_ID,
      mappings: [
        {
          displayLabel: "Cantine",
          sourceColumn: "cafeteria",
          targetCategory: "OTHER_ELEMENTS",
        },
        {
          displayLabel: "Note interne",
          sourceColumn: "note_interne",
          targetCategory: "INFORMATIONAL_NOTE",
        },
      ],
      createWriteSupabase: () => client,
      readSupabase: client,
    });

    expect(result).toEqual({
      importId: IMPORT_ID,
      mappedColumnCount: 2,
      status: "READY_FOR_PREVIEW",
    });
    expect(db.column_mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agency_id: AGENCY_ID,
          created_by: ACTOR_PROFILE_ID,
          display_label: "Cantine",
          source_column: "cafeteria",
          target_category: "OTHER_ELEMENTS",
        }),
        expect.objectContaining({
          agency_id: AGENCY_ID,
          created_by: ACTOR_PROFILE_ID,
          display_label: "Note interne",
          source_column: "note_interne",
          target_category: "INFORMATIONAL_NOTE",
        }),
      ]),
    );
    expect(db.payroll_import_rows[0]).toMatchObject({
      pay_items: [
        {
          amount: 2500,
          category: "OTHER_ELEMENTS",
          label: "Cantine",
          rawValue: 2500,
        },
        {
          category: "INFORMATIONAL_NOTE",
          label: "Note interne",
          rawValue: "Avance soldee",
          text: "Avance soldee",
        },
      ],
    });
    expect(db.payroll_imports[0]).toMatchObject({ status: "READY_FOR_PREVIEW" });
  });

  it("rejects a mapping update for an import outside the manager agency", async () => {
    const db = createMappingDb();
    db.payroll_imports.push({
      agency_id: OTHER_AGENCY_ID,
      id: IMPORT_ID,
      status: "NEEDS_MAPPING",
    });

    const client = createMappingClient(db) as unknown as MappingClient;

    await expect(
      resolveImportColumnMappings({
        actor: {
          agencyId: AGENCY_ID,
          id: ACTOR_PROFILE_ID,
          role: "agency_manager",
        },
        importId: IMPORT_ID,
        mappings: [
          {
            displayLabel: "Cantine",
            sourceColumn: "cafeteria",
            targetCategory: "OTHER_ELEMENTS",
          },
        ],
        createWriteSupabase: () => client,
        readSupabase: client,
      }),
    ).rejects.toThrow("Action non autorisee.");
  });
});
