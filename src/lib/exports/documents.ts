import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import type { EmployeePayslip } from "@/lib/payslips/employee";
import { PdfExportError } from "@/lib/payslips/pdf";

const number = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number().finite());
const item = z.object({ id: z.string().optional(), label: z.string().min(1), category: z.string().min(1), amount: number.optional(), text: z.string().optional() }).refine((value) => value.amount !== undefined || value.text !== undefined);
const relation = <T extends z.ZodType>(schema: T) => z.union([schema, z.array(schema).length(1).transform((rows) => rows[0])]);
const documentRow = z.object({
  id: z.string().min(1), period_start: z.string().min(1), period_end: z.string().min(1), published_at: z.string().min(1),
  employee: relation(z.object({ full_name: z.string().min(1) })),
  current_version: relation(z.object({
    snapshot_data: z.object({ grossAmount: number, deductionsTotal: number, netAmount: number }),
    pay_items: z.array(item),
  })),
});

export async function loadPublishedDocuments(supabase: Awaited<ReturnType<typeof createClient>>, input: { agencyId?: string; periodStart?: string; periodEnd?: string }): Promise<EmployeePayslip[]> {
  let query = supabase.from("payslips").select("id,period_start,period_end,published_at,employee:employees!inner(full_name),current_version:payslip_versions!payslips_current_version_fk(snapshot_data,pay_items)")
    .not("current_version_id", "is", null).order("period_start", { ascending: false }).order("id");
  if (input.agencyId) query = query.eq("agency_id", input.agencyId);
  if (input.periodStart) query = query.gte("period_start", input.periodStart);
  if (input.periodEnd) query = query.lte("period_end", input.periodEnd);
  const { data, error } = await query.limit(101);
  if (error) throw new Error("Impossible de charger les fiches.");
  if (!data?.length) throw new PdfExportError("Aucune fiche publiée dans cette sélection.");
  if (data.length > 100) throw new PdfExportError("Le PDF est limité à 100 fiches. Réduisez la période ou sélectionnez une agence.");
  return data.map((raw) => {
    const row = documentRow.parse(raw);
    return {
      id: row.id, employeeName: row.employee.full_name,
      periodStart: row.period_start, periodEnd: row.period_end,
      periodLabel: `${row.period_start} - ${row.period_end}`, publishedAt: row.published_at,
      ...row.current_version.snapshot_data,
      payItems: row.current_version.pay_items.map((item, index) => item.amount !== undefined
        ? { id: item.id ?? String(index), label: item.label, category: item.category, amount: item.amount }
        : { id: item.id ?? String(index), label: item.label, category: item.category, text: item.text ?? "" }),
    };
  });
}
