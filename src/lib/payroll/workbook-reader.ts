import * as XLSX from "xlsx";
import type { PayItem } from "@/lib/payroll/mapping";
import type { PayrollRowError } from "@/lib/payroll/schema";
import { assertSafeXlsxContainer } from "@/lib/payroll/xlsx-guard";

type RawRow = Record<string, unknown>;
type Period = { periodStart: string; periodEnd: string };
export type PayrollWorkbook = {
  format: "standard" | "airtel" | "huawei";
  rows: RawRow[];
  rowNumbers: number[];
  payItemsByRow: Map<number, PayItem[]>;
  issuesByRow: Map<number, PayrollRowError[]>;
};

export class PayrollWorkbookError extends Error {}
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const MAX_ROWS = 2000;
const MAX_COLUMNS = 128;

// Read saved Excel values only. Formulas, macros and external links are never executed.
export async function readPayrollWorkbook(file: File, period: Period): Promise<PayrollWorkbook> {
  if (file.size > 4 * 1024 * 1024) throw new PayrollWorkbookError("Le fichier dépasse la limite de 4 Mo.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().trim().endsWith(".xls")) {
    const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (!signature.every((byte, i) => bytes[i] === byte)) throw new PayrollWorkbookError("Le fichier .xls doit être un classeur Excel binaire valide.");
  } else {
    await assertSafeXlsxContainer(file);
  }
  const options: XLSX.ParsingOptions = { type: "array", cellDates: true, cellFormula: true, cellHTML: false, cellText: false, bookVBA: false };
  const index = XLSX.read(bytes, { ...options, bookSheets: true });
  const standard = index.SheetNames.filter((name) => normalize(name) === "payroll");
  const airtel = index.SheetNames.filter((name) => normalize(name) === "recap global");
  if (standard.length > 1 || airtel.length > 1 || (standard.length && airtel.length)) throw new PayrollWorkbookError("Plusieurs feuilles de paie possibles. Conservez une seule feuille principale.");
  let sheetName = standard[0] ?? airtel[0];
  let format: PayrollWorkbook["format"] = standard.length ? "standard" : "airtel";
  let workbook: XLSX.WorkBook;
  if (sheetName) {
    workbook = XLSX.read(bytes, { ...options, sheets: [sheetName] });
  } else {
    // Only the header band is needed to identify Huawei; annexes must not become payslips.
    const headers = XLSX.read(bytes, { ...options, sheetRows: 20 });
    const candidates = headers.SheetNames.filter((name) => findHeader(headers.Sheets[name], "huawei") !== undefined);
    if (candidates.length !== 1) throw new PayrollWorkbookError("Feuille de paie non reconnue ou ambiguë. Formats acceptés : payroll, Airtel Recap global, Huawei mensuel.");
    sheetName = candidates[0];
    format = "huawei";
    workbook = XLSX.read(bytes, { ...options, sheets: [sheetName] });
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new PayrollWorkbookError("Feuille de paie introuvable.");
  const headerNumber = format === "standard" ? 1 : findHeader(sheet, format);
  if (!headerNumber) throw new PayrollWorkbookError("Les en-têtes obligatoires du format de paie sont absents.");
  if (format === "huawei") validateHuaweiMonth(sheetName, period);
  const populatedRows = new Map<number, Map<number, XLSX.CellObject>>();
  // Do not iterate !ref: real files contain formatting extending to row 1048554.
  for (const [address, cell] of Object.entries(sheet)) {
    if (!/^[A-Z]+\d+$/.test(address) || (cell.v == null && !cell.f)) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (c >= MAX_COLUMNS) throw new PayrollWorkbookError("La feuille de paie dépasse 128 colonnes utiles.");
    const row = populatedRows.get(r + 1) ?? new Map();
    row.set(c, cell);
    populatedRows.set(r + 1, row);
  }
  const headers = new Map<number, string>();
  const seen = new Set<string>();
  for (const [column, cell] of populatedRows.get(headerNumber) ?? []) {
    const label = String(cell.v ?? "").trim();
    if (!label) continue;
    const key = format === "standard" ? label : normalize(label);
    if (seen.has(key)) throw new PayrollWorkbookError(`En-tête dupliqué : ${label}.`);
    seen.add(key);
    headers.set(column, label);
  }
  const result: PayrollWorkbook = { format, rows: [], rowNumbers: [], payItemsByRow: new Map(), issuesByRow: new Map() };
  for (const [rowNumber, cells] of [...populatedRows].sort(([a], [b]) => a - b)) {
    if (rowNumber <= headerNumber) continue;
    const raw = Object.fromEntries([...headers].map(([column, label]) => [format === "standard" ? label : normalize(label), cellValue(cells.get(column))]));
    if (format !== "standard") {
      const name = raw[format === "airtel" ? "name" : "hrms offical name"];
      const id = raw[format === "airtel" ? "matricule" : "id"];
      // Totals and notes have no employee identity. A named employee without an ID is retained as an error.
      const identityKeys = format === "airtel" ? ["name", "matricule"] : ["hrms offical name", "id"];
      const invalidIdentityCell = [...headers].some(([column, label]) => {
        const cell = cells.get(column);
        return identityKeys.includes(normalize(label)) && (cell?.t === "e" || (cell?.f && cell.v == null));
      });
      if (!name && !id && !invalidIdentityCell) continue;
      if (/^(grand\s+)?total(?:\s|$)/i.test(String(name ?? "")) && !id) continue;
    } else if (!Object.values(raw).some((value) => value !== "" && value != null)) continue;
    if (result.rows.length >= MAX_ROWS) throw new PayrollWorkbookError("La feuille dépasse la limite de 2 000 lignes de paie.");
    const issues: PayrollRowError[] = [];
    for (const [column, label] of headers) {
      const cell = cells.get(column);
      if (cell?.t === "e" || (cell?.f && cell.v == null)) issues.push({ fieldName: label, errorCode: "EXCEL_VALUE_UNAVAILABLE", message: `Valeur Excel indisponible pour « ${label} ». Recalculez et enregistrez le classeur dans Excel.`, rawValue: null });
    }
    result.rows.push(format === "standard" ? raw : adaptNativeRow(raw, format, period));
    result.rowNumbers.push(rowNumber);
    if (issues.length) result.issuesByRow.set(rowNumber, issues);
    if (format !== "standard") result.payItemsByRow.set(rowNumber, nativePayItems(raw, headers, format));
  }
  return result;
}

function cellValue(cell?: XLSX.CellObject): unknown {
  if (!cell || cell.t === "e") return "";
  if (cell.v instanceof Date) {
    return `${cell.v.getFullYear()}-${String(cell.v.getMonth() + 1).padStart(2, "0")}-${String(cell.v.getDate()).padStart(2, "0")}`;
  }
  return cell.v ?? "";
}

function findHeader(sheet: XLSX.WorkSheet, format: "airtel" | "huawei"): number | undefined {
  const required = format === "airtel"
    ? ["name", "matricule", "salaire de base", "salaire brut", "salaire net", "cnaps 1%", "ostie 1%", "irsa", "deduction avance"]
    : ["id", "hrms offical name", "actual basic salary", "total of gross salary", "net pay", "np2", "cnaps employee 1%", "ostie employee 1%", "individual income tax irsa", "cash advance"];
  for (let row = 1; row <= 20; row++) {
    const labels = new Set(Array.from({ length: MAX_COLUMNS }, (_, column) => normalize(sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })]?.v)));
    if (required.every((label) => labels.has(label))) return row;
  }
}

function number(value: unknown): number {
  if (value == null || value === "") return 0;
  return typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
}

const deductionColumns = {
  airtel: ["cnaps 1%", "ostie 1%", "irsa", "deduction avance"],
  huawei: ["cnaps employee 1%", "ostie employee 1%", "individual income tax irsa", "cash advance"],
};

function isDeductionColumn(column: string, format: "airtel" | "huawei") {
  return deductionColumns[format].includes(column) ||
    (format === "huawei" && /^total po amount before tax(?:\s*\([^)]*\))?$/.test(column));
}

function adaptNativeRow(raw: RawRow, format: "airtel" | "huawei", period: Period): RawRow {
  return {
    employee_id: raw[format === "airtel" ? "matricule" : "id"],
    employee_name: raw[format === "airtel" ? "name" : "hrms offical name"],
    email: raw.email || raw.mail || "",
    period_start: period.periodStart,
    period_end: period.periodEnd,
    role: raw[format === "airtel" ? "poste occupe" : "position"],
    department: raw.departement,
    base_salary: raw[format === "airtel" ? "salaire de base" : "actual basic salary"],
    gross_amount: raw[format === "airtel" ? "salaire brut" : "total of gross salary"],
    net_amount: raw[format === "airtel" ? "salaire net" : "np2"],
    // Sum existing employee deductions, never infer gross - net: both formats contain net additions.
    deductions_total: Object.entries(raw).reduce((sum, [column, value]) => sum + (isDeductionColumn(column, format) ? number(value) : 0), 0),
  };
}

function nativePayItems(raw: RawRow, headers: Map<number, string>, format: "airtel" | "huawei"): PayItem[] {
  const excluded = new Set(format === "airtel"
    ? ["dep", "name", "matricule", "auiid", "doj", "salaire brut", "salaire net", "mode de paiement", "virement", "airtel money", "airtel money avec frais de transfert", "frais d'envoi", "frais de retrait"]
    : ["name", "n°", "id", "hrms offical name", "employ date", "total of gross salary", "np2"]);
  excluded.add("email"); excluded.add("mail");
  const monetary = new Set(format === "airtel"
    ? ["salaire nb de jours", "rappel sme kyc", "prime d'interim", "commission outbound", "primes exceptionnelles", "commission kyc", "des&installers commissions", "sip tbs", "hbb", "logement", "indemnite de deplacement", "mileage avril", "stc conge 1", "stc conge 2", "montant icc", "montant hs 130%", "montant hs 150%", "montant hn", "montant dimanche", "montant ferie", "indemnite de preavis&rupture", "bonus", "abbattement irsa", "avance a facturer", "allocation familiale", "indemnite de preavis", "indemnite de licenciement", "incentive squad", "paiement additif a refacturer", "regul"]
    : ["basic salary of the month", "regul salary", "telephone allowance (cash)", "transport allowance", "overtime", "incentive major q4", "incentive outstanding h2", "allowance calculation", "business trip", "annual leave", "shining star", "13th month", "ot net", "business trip net", "ot to be regularize", "bt to be regularize", "notice", "others-reimbursement", "reliquat", "allocation familiale"]);
  return [...headers.values()].flatMap((label): PayItem[] => {
    const key = normalize(label), value = raw[key];
    if (excluded.has(key) || value === "" || value == null) return [];
    // Préavis à déduire / Other Income (-) / Lieu of notice payment already affect gross/cash compensation.
    // Show them as information rather than subtracting them a second time from the net.
    const deduction = isDeductionColumn(key, format);
    if ((monetary.has(key) || deduction) && Number.isFinite(number(value))) {
      return [{ label, category: deduction ? "DEDUCTION" : "OTHER_ELEMENTS", amount: number(value), rawValue: value }];
    }
    // Quantities, employer contributions, reference salaries and subtotals remain information, not gains.
    return [{ label, category: "INFORMATIONAL_NOTE", text: String(value), rawValue: value }];
  });
}

function validateHuaweiMonth(sheetName: string, period: Period) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const name = normalize(sheetName);
  const month = months.findIndex((value) => new RegExp(`^${value}(?:\\s+\\d{4})?$`).test(name));
  const year = name.match(/\b(20\d{2})\b/)?.[1];
  if ((month >= 0 && (Number(period.periodStart.slice(5, 7)) !== month + 1 || period.periodStart.slice(0, 7) !== period.periodEnd.slice(0, 7))) || (year && !period.periodStart.startsWith(year))) {
    throw new PayrollWorkbookError("La période sélectionnée ne correspond pas à la feuille mensuelle Huawei.");
  }
}
