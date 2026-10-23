import { z } from "zod";
import { EmployeeIdSchema } from "./identity";
export const AgencyUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
/** Calendar day used by lifecycle mutations, independent of the browser timezone. */
export function agencyToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
const validDay = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
const revision = z.number().int().positive();
const optionalId = z.union([AgencyUuid, z.literal(""), z.null()]).transform((value) => value || null);
export const AgencyCreateSchema = z.object({ matricule: EmployeeIdSchema, fullName: z.string().trim().min(1).max(160), email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()) }).strict();
export const AgencyUpdateSchema = z.object({ employeeId: AgencyUuid, identityRevision: revision, operationalRevision: revision, fullName: z.string().trim().min(1).max(160), jobTitle: z.string().trim().max(160), departmentId: optionalId, siteId: optionalId, teamId: optionalId, reason: z.string().trim().min(3).max(300) }).strict();
export const AgencyDepartureSchema = z.object({ employeeId: AgencyUuid, identityRevision: revision, lifecycleRevision: revision, departedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= agencyToday(); }, "La date de départ doit être réelle et ne peut pas être future."), reason: z.enum(["RESIGNATION", "CONTRACT_END", "DISMISSAL", "RETIREMENT", "OTHER"]) }).strict();
export const AGENCY_REQUEST_TYPES = ["RETURN", "EMAIL", "MATRICULE", "MANAGER"] as const;
export const AgencyRequestSchema = z.object({ employeeId: AgencyUuid, identityRevision: revision, lifecycleRevision: revision, type: z.enum(AGENCY_REQUEST_TYPES), value: z.string().trim().max(254), reason: z.string().trim().min(3).max(300) }).strict().superRefine((data, ctx) => {
  const valid = data.type === "RETURN" ? validDay(data.value) && data.value <= agencyToday() : data.type === "EMAIL" ? z.string().email().safeParse(data.value).success : data.type === "MATRICULE" ? EmployeeIdSchema.safeParse(data.value).success : !data.value || AgencyUuid.safeParse(data.value).success;
  if (!valid) ctx.addIssue({ code: "custom", path: ["value"], message: "Valeur demandée invalide." });
});
export const AgencyDecisionSchema = z.object({ requestId: AgencyUuid, revision, decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(3).max(300) }).strict();
