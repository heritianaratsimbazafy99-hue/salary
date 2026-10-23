import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { z } from "zod";
import { getCurrentActor } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { PublicationReviewSchema } from "@/lib/payroll/manager-review";
import { DepartedPayrollApproval } from "@/components/imports/DepartedPayrollApproval";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { formatDay, formatMga } from "@/components/ui/format";

export const dynamic = "force-dynamic";
const ImportSchema = z.object({ agency_id: z.string(), source_filename: z.string(), period_start: z.string(), period_end: z.string(), status: z.string() });
const RowSchema = z.object({ id: z.string(), employee_id: z.string(), employee_name: z.string(), normalized_data: z.object({ grossAmount: z.number().finite(), deductionsTotal: z.number().finite(), netAmount: z.number().finite() }) });
export default async function Page({ params }: { params: Promise<{ importId: string }> }) {
  const actor = await getCurrentActor();
  if (!["hr_central", "super_admin"].includes(actor.role)) notFound();
  const { importId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(importId)) notFound();
  const client = await createClient();
  // Read the reviewed version before loading the amounts, then verify it again.
  // The approval endpoint performs the same fingerprint check under locks.
  const first = await client.rpc("review_payroll_import", { p_import_id: importId });
  const review = PublicationReviewSchema.safeParse(first.data);
  if (first.error || !review.success) notFound();
  const metadata = await client.from("payroll_imports").select("agency_id,source_filename,period_start,period_end,status").eq("id", importId).maybeSingle();
  const payrollImport = ImportSchema.safeParse(metadata.data);
  if (metadata.error || !payrollImport.success) notFound();
  const agency = await client.from("agencies").select("name").eq("id", payrollImport.data.agency_id).maybeSingle();
  if (agency.error || !agency.data || typeof agency.data.name !== "string") throw new Error("Impossible de charger l’agence de cet import.");
  const rows: z.infer<typeof RowSchema>[] = [];
  let validAmounts = true;
  for (let offset = 0; ; offset += 500) {
    const batch = await client.from("payroll_import_rows").select("id,employee_id,employee_name,normalized_data").eq("import_id", importId).eq("agency_id", payrollImport.data.agency_id).order("id", { ascending: true }).range(offset, offset + 499);
    if (batch.error) throw new Error("Impossible de charger les lignes de paie à examiner.");
    for (const row of batch.data ?? []) {
      const parsed = RowSchema.safeParse(row);
      if (parsed.success) rows.push(parsed.data); else validAmounts = false;
    }
    if (!batch.data || batch.data.length < 500) break;
  }
  const last = await client.rpc("review_payroll_import", { p_import_id: importId });
  const checkedReview = PublicationReviewSchema.safeParse(last.data);
  const coherent = !last.error && checkedReview.success && checkedReview.data.fingerprint === review.data.fingerprint;
  const departed = review.data.recipients.filter((recipient) => recipient.departed);
  const departedIds = new Set(departed.map((recipient) => recipient.employeeId));
  const displayedRows = rows.filter((row) => departedIds.has(row.employee_id));
  const complete = validAmounts && departed.every((recipient) => displayedRows.some((row) => row.employee_id === recipient.employeeId));
  const ready = coherent && complete && departed.length > 0 && payrollImport.data.status === "READY_FOR_PREVIEW";
  return <AppShell role={actor.role}><div className="grid gap-6">
    <PageHeader title="Validation RH de paie après départ" eyebrow="Ressources humaines" icon={FileCheck2} description="Examinez les lignes de la paie validée concernant les salariés partis avant d’autoriser leur publication." />
    <Panel title={agency.data.name} description={payrollImport.data.source_filename}><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Période de paie</dt><dd>{formatDay(payrollImport.data.period_start)} → {formatDay(payrollImport.data.period_end)}</dd></div><div><dt className="text-muted-foreground">Lignes de salariés partis</dt><dd>{displayedRows.length}</dd></div></dl></Panel>
    {!coherent ? <Panel title="La version de paie a changé"><p role="alert" className="text-sm">Les données ont changé pendant le chargement. Rechargez la revue pour examiner les montants de la nouvelle version.</p><Link href={`/hr/payroll-departure-review/${importId}`} className={buttonClasses({ variant: "secondary", className: "mt-4" })}>Rafraîchir la revue</Link></Panel> : <>
      <Panel title="Lignes après départ" description="Les noms et montants affichés proviennent de la source de paie. Cette autorisation ne crée pas de nouveau contrat et ne réactive ni l’emploi ni l’accès.">
        {displayedRows.length ? <ul className="grid gap-4">{displayedRows.map((row) => { const recipient = departed.find((candidate) => candidate.employeeId === row.employee_id); return <li key={row.id} className="rounded-xl border border-border p-4"><h2 className="break-words text-sm font-semibold">{row.employee_name} · {row.employee_id} — parti</h2><p className="mt-1 break-all text-sm text-muted-foreground">{recipient?.email}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Brut</dt><dd className="font-semibold">{formatMga(row.normalized_data.grossAmount)}</dd></div><div><dt className="text-muted-foreground">Retenues</dt><dd className="font-semibold">{formatMga(row.normalized_data.deductionsTotal)}</dd></div><div><dt className="text-muted-foreground">Net</dt><dd className="font-semibold">{formatMga(row.normalized_data.netAmount)}</dd></div></dl></li>; })}</ul> : <p className="text-sm text-muted-foreground">Aucune ligne de salarié parti à autoriser.</p>}
      </Panel>
      {!complete ? <Panel><p role="alert" className="text-sm text-danger">Les montants ne peuvent pas tous être examinés. Faites corriger l’import avant de demander une validation.</p></Panel> : null}
      {ready ? <Panel title="Autoriser cette version"><DepartedPayrollApproval importId={importId} fingerprint={review.data.fingerprint} /></Panel> : coherent && complete && departed.length > 0 ? <Panel><p className="text-sm text-muted-foreground">Cet import n’est plus en attente de publication. Une nouvelle validation n’est pas disponible.</p></Panel> : null}
    </>}
  </div></AppShell>;
}
