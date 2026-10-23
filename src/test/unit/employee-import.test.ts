import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildEmployeeImportTemplate, parseEmployeeImport } from "@/lib/employees/import-parser";
import { EMPLOYEE_IMPORT_MAX_BYTES } from "@/lib/employees/import-schema";
function file(rows: unknown[][], edit?: (sheet: XLSX.WorkSheet) => void) {
  const sheet = XLSX.utils.aoa_to_sheet([["matricule", "nom_complet", "email"], ...rows]); edit?.(sheet);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "salaries");
  return new File([XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true })], "employees.xlsx");
}
describe("employee creation import workbook", () => {
  it("reads its independent template preserving leading zeroes", async () => {
    const rows = await parseEmployeeImport(new File([Buffer.from(buildEmployeeImportTemplate())], "employees.xlsx"));
    expect(rows[0]).toMatchObject({ matricule: "00001", row_number: 2, issues: [] });
  });
  it("shares ASCII identity canonicalization and normalizes email", async () => {
    const rows = await parseEmployeeImport(file([[" é-ab-ß ", " Personne ", " A@Example.test "]]));
    expect(rows[0]).toEqual({ matricule: "é-AB-ß", nom_complet: "Personne", email: "a@example.test", row_number: 2, issues: [] });
  });
  it("rejects numeric IDs even with zero formatting, formulas with cached values and missing fields", async () => {
    const rows = await parseEmployeeImport(file([[1, "Nom", "n@example.test"], ["00002", "Nom", "x@example.test"], ["00003", "", "bad"]], sheet => { sheet.A2.z = "00000"; sheet.B3.f = '"Nom"'; }));
    expect(rows.every(row => row.issues.length > 0)).toBe(true);
    expect(rows[0].issues.join()).toContain("cellule texte");
    expect(rows[1].issues.join()).toContain("formules");
  });
  it("ignores formatting-only ranges and preserves source row numbers", async () => {
    const rows = await parseEmployeeImport(file([["00001", "Nom", "n@example.test"], [], ["00002", "Nom", "n2@example.test"]], sheet => { sheet["!ref"] = "A1:C1048576"; }));
    expect(rows.map(row => row.row_number)).toEqual([2, 4]);
  });
  it("accepts 340 and 1000 employees, rejects 1001", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [`${i}`.padStart(5,"0"), "Personne", `person${i}@example.test`]);
    expect(await parseEmployeeImport(file(rows.slice(0,340)))).toHaveLength(340);
    expect(await parseEmployeeImport(file(rows.slice(0,1000)))).toHaveLength(1000);
    await expect(parseEmployeeImport(file(rows))).rejects.toThrow("1 000");
  });
  it("rejects wrong format, malformed ZIP, oversized files and extra columns", async () => {
    await expect(parseEmployeeImport(new File(["csv"], "employees.csv"))).rejects.toThrow("XLSX");
    await expect(parseEmployeeImport(new File(["not zip"], "employees.xlsx"))).rejects.toThrow("invalide");
    await expect(parseEmployeeImport(new File([new Uint8Array(EMPLOYEE_IMPORT_MAX_BYTES+1)], "employees.xlsx"))).rejects.toThrow("4 Mo");
    await expect(parseEmployeeImport(file([["ID", "Nom", "n@example.test", "private"]]))).rejects.toThrow("uniquement");
  });
});
