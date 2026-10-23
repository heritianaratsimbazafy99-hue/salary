import * as XLSX from "xlsx";
import { assertSafeXlsxContainer } from "@/lib/payroll/xlsx-guard";
import { canonicalEmployeeId } from "./identity";
import { EmployeeImportInputError, EMPLOYEE_IMPORT_MAX_BYTES, EMPLOYEE_IMPORT_MAX_ROWS, EmployeeImportIdentitySchema, type EmployeeImportRow } from "./import-schema";

export async function parseEmployeeImport(file: File): Promise<EmployeeImportRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new EmployeeImportInputError("Utilisez le modèle XLSX salariés, indépendant des fichiers de paie.");
  if (!file.size || file.size > EMPLOYEE_IMPORT_MAX_BYTES) throw new EmployeeImportInputError("Le fichier doit contenir entre 1 octet et 4 Mo.");
  try { await assertSafeXlsxContainer(file); } catch { throw new EmployeeImportInputError("Classeur XLSX invalide ou trop complexe."); }
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellFormula: true, cellNF: true, cellText: true, cellHTML: false, bookVBA: false }); }
  catch { throw new EmployeeImportInputError("Le classeur XLSX ne peut pas être lu."); }
  if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== "salaries") throw new EmployeeImportInputError("Conservez une seule feuille nommée « salaries ».");
  const sheet = workbook.Sheets.salaries;
  const populated = new Map<number, Map<number, XLSX.CellObject>>();
  for (const [address, cell] of Object.entries(sheet)) {
    if (!/^[A-Z]+\d+$/.test(address) || (cell.v == null && !cell.f)) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (c > 2) throw new EmployeeImportInputError("Le modèle accepte uniquement matricule, nom_complet et email.");
    const row = populated.get(r + 1) ?? new Map<number, XLSX.CellObject>(); row.set(c, cell); populated.set(r + 1, row);
  }
  const columns = ["matricule", "nom_complet", "email"] as const;
  if (!columns.every((name, column) => populated.get(1)?.get(column)?.v === name && !populated.get(1)?.get(column)?.f)) throw new EmployeeImportInputError("En-têtes attendus : matricule, nom_complet, email (dans cet ordre).");
  const result: EmployeeImportRow[] = [];
  for (const [number, cells] of [...populated].sort(([a], [b]) => a - b)) {
    if (number === 1) continue;
    if (result.length >= EMPLOYEE_IMPORT_MAX_ROWS) throw new EmployeeImportInputError("Le fichier dépasse 1 000 lignes salariés.");
    const issues: string[] = [];
    const values = columns.map((name, column) => {
      const cell = cells.get(column);
      if (cell?.f || cell?.t === "e") issues.push(`${name} : les formules et erreurs Excel sont interdites. Remplacez-les par du texte.`);
      if (name === "matricule" && cell && cell.t !== "s") issues.push("Le matricule doit être une cellule texte pour préserver ses zéros initiaux.");
      return String(cell?.v ?? "").trim().slice(0, column === 0 ? 200 : 512);
    });
    const raw = { matricule: canonicalEmployeeId(values[0]), nom_complet: values[1], email: values[2].toLowerCase() };
    const parsed = EmployeeImportIdentitySchema.safeParse(raw);
    if (!parsed.success) issues.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`));
    result.push({ row_number: number, ...(parsed.success ? parsed.data : raw), issues });
  }
  if (!result.length) throw new EmployeeImportInputError("Le fichier ne contient aucun salarié.");
  return result;
}

export function buildEmployeeImportTemplate(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([["matricule", "nom_complet", "email"], ["00001", "Exemple Salarié", "salarie@example.com"]]);
  sheet.A2.z = "@";
  sheet["!cols"] = [{ wch: 20 }, { wch: 40 }, { wch: 40 }];
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "salaries");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
}
