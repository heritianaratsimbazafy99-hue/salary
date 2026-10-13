"use client";

import { useState } from "react";
import { ExportDownload } from "./ExportDownload";
import { Input } from "@/components/ui/Input";
import type { ExportType } from "@/lib/payroll/export";

export function ExportPanel({ agencies }: { agencies: Array<{ id: string; name: string }> }) {
  const [agencyId, setAgencyId] = useState("");
  const [exportType, setExportType] = useState<ExportType>("PUBLISHED_PAYSLIPS");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const selectClass = "h-11 rounded-xl border border-border bg-surface px-3 text-sm";
  return <section className="grid gap-6 rounded-2xl border border-border bg-surface p-6" aria-label="Préparer un export">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Données à exporter<select className={selectClass} value={exportType} onChange={(event) => setExportType(event.target.value as ExportType)}><option value="PUBLISHED_PAYSLIPS">Fiches publiées</option><option value="IMPORT_REPORT">Rapport des imports</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Agence<select className={selectClass} value={agencyId} onChange={(event) => setAgencyId(event.target.value)}><option value="">Toutes les agences</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label>
      <Input type="date" label="Début de période (inclus)" name="export-period-start" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
      <Input type="date" label="Fin de période (incluse)" name="export-period-end" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
    </div>
    <p className="text-sm text-muted-foreground">Seules les périodes entièrement comprises dans les dates choisies sont incluses. CSV et Excel : 5 000 lignes maximum. PDF : 100 fiches détaillées maximum. Les documents PDF sont destinés à un usage interne et ne constituent pas des bulletins légaux.</p>
    <ExportDownload agencyId={agencyId || undefined} exportType={exportType} periodStart={periodStart || undefined} periodEnd={periodEnd || undefined} allowPdf />
  </section>;
}
