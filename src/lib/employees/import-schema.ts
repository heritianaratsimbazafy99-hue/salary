import { z } from "zod";
import { EmployeeIdSchema } from "./identity";

export class EmployeeImportInputError extends Error {}

export const EMPLOYEE_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
export const EMPLOYEE_IMPORT_MAX_ROWS = 1000;
export const EmployeeImportIdentitySchema = z.object({
  matricule: EmployeeIdSchema,
  nom_complet: z.string().trim().min(1, "Le nom complet est obligatoire.").max(160),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("L’email est invalide.")),
}).strict();
export type EmployeeImportRow = {
  row_number: number;
  matricule: string;
  nom_complet: string;
  email: string;
  issues: string[];
};
export type EmployeeImportReportRow = EmployeeImportRow & {
  classification: "CREATE" | "IDENTICAL" | "CONFLICT" | "DUPLICATE" | "ARCHIVED" | "DISABLED" | "INVALID" | "EXCLUDED";
  employee_uuid: string | null;
  expected_revision: number | null;
};
export type EmployeeImportReport = {
  id: string; status: "READY" | "INVALID" | "COMMITTED"; fingerprint: string;
  created_at: string; expires_at: string; committed_at: string | null;
  created_count: number; rows: EmployeeImportReportRow[];
};
export const EmployeeImportReviewSchema = z.object({
  excluded: z.array(z.number().int().min(2)).max(1000),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
