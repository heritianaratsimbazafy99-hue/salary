import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Search, UserRoundX } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { formatDay } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Avatar, EmptyState } from "@/components/ui/Surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import type { DirectoryEntry } from "@/lib/hr/employees";
import { CONTRACT_TYPE_LABEL, EMPLOYEE_STATUS_BADGE, EMPLOYEE_STATUS_LABEL } from "@/lib/hr/labels";

function Status({ entry }: { entry: DirectoryEntry }) {
  if (!entry.status) return <StatusBadge status="WARNING" label="Dossier à compléter" />;
  return <StatusBadge status={EMPLOYEE_STATUS_BADGE[entry.status]} label={EMPLOYEE_STATUS_LABEL[entry.status]} />;
}

function contract(entry: DirectoryEntry) {
  if (!entry.contract_type || !entry.contract_start) return "—";
  return `${CONTRACT_TYPE_LABEL[entry.contract_type]} · ${formatDay(entry.contract_start)}${entry.contract_end ? ` → ${formatDay(entry.contract_end)}` : ""}`;
}

function Name({ entry, href }: { entry: DirectoryEntry; href?: string }) {
  const label = <span className="font-semibold">{entry.full_name}</span>;
  return <div className="flex min-w-0 items-center gap-3"><Avatar name={entry.full_name} /><div className="min-w-0 [overflow-wrap:anywhere]">
    {href ? <Link className="hover:underline focus-visible:underline" href={href}>{label}</Link> : label}
    <p className="font-mono text-xs text-muted-foreground">{entry.matricule}</p></div></div>;
}

/**
 * Operational directory. Cards on mobile, table on large screens. It only
 * renders the non-private columns returned by the scoped database function.
 */
export function EmployeeDirectory({ entries, count, page, pageHref, hrefFor, showManager = true }: {
  entries: DirectoryEntry[]; count: number; page: number; pageHref: (page: number) => string;
  hrefFor?: (entry: DirectoryEntry) => string; showManager?: boolean;
}) {
  if (!entries.length) return <EmptyState icon={Search} headingLevel={3} title="Aucun collaborateur correspondant." description="Modifiez la recherche ou les filtres." />;
  const pageCount = Math.max(1, Math.ceil(count / 25));
  return <div className="grid min-w-0 gap-4">
    <p className="text-sm font-medium text-muted-foreground">{count} collaborateur(s){count > 25 ? ` — page ${page} / ${pageCount}` : ""}</p>
    <ul className="grid gap-3 lg:hidden">{entries.map((entry) => <li key={entry.employee_id} className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><Name entry={entry} href={hrefFor?.(entry)} /><Status entry={entry} /></div>
      {entry.has_record ? <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2"><dt className="text-xs text-muted-foreground">Poste</dt><dd>{entry.job_title}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Site</dt><dd className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{entry.site_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Département</dt><dd>{entry.department_name}</dd></div>
        {showManager ? <div><dt className="text-xs text-muted-foreground">Responsable</dt><dd>{entry.manager_name ?? "—"}</dd></div> : null}
        <div className={showManager ? "" : "col-span-2"}><dt className="text-xs text-muted-foreground">Contrat</dt><dd>{contract(entry)}</dd></div>
      </dl> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><UserRoundX className="size-4" aria-hidden="true" />Salarié connu par la paie, sans dossier RH.</p>}
    </li>)}</ul>
    <Table containerClassName="hidden lg:block">
      <TableHeader><TableRow><TableHead>Collaborateur</TableHead><TableHead>Poste</TableHead><TableHead>Site · équipe</TableHead><TableHead>Département</TableHead>{showManager ? <TableHead className="hidden xl:table-cell">Responsable</TableHead> : null}<TableHead>Contrat</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
      <TableBody>{entries.map((entry) => <TableRow key={entry.employee_id}>
        <TableCell><Name entry={entry} href={hrefFor?.(entry)} /></TableCell>
        <TableCell>{entry.job_title ?? "—"}</TableCell>
        <TableCell>{entry.site_name ?? "—"}{entry.team_name ? <span className="block text-xs text-muted-foreground">{entry.team_name}</span> : null}</TableCell>
        <TableCell>{entry.department_name ?? "—"}</TableCell>
        {showManager ? <TableCell className="hidden xl:table-cell">{entry.manager_name ?? "—"}</TableCell> : null}
        <TableCell>{entry.contract_type && entry.contract_start ? <><span className="block font-medium">{CONTRACT_TYPE_LABEL[entry.contract_type]}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{formatDay(entry.contract_start)}{entry.contract_end ? ` → ${formatDay(entry.contract_end)}` : ""}</span></> : "—"}</TableCell>
        <TableCell><Status entry={entry} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {count > 25 ? <nav aria-label="Pages des collaborateurs" className="flex flex-wrap items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageHref(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" />Précédente</Link> : null}
      <span className="rounded-full bg-muted px-3 py-1 font-semibold tabular-nums text-muted-foreground">{page} / {pageCount}</span>
      {page < pageCount ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageHref(page + 1)}>Suivante<ChevronRight className="size-4" aria-hidden="true" /></Link> : null}
    </nav> : null}
  </div>;
}
