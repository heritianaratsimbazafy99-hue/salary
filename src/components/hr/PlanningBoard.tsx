import { ArrowRightLeft, CalendarRange, MapPin, Plus, Save, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDay } from "@/components/ui/format";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Avatar, EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import type { HrReferential } from "@/lib/hr/referential";
import {
  ASSIGNMENT_STATUS_BADGE, ASSIGNMENT_STATUS_LABEL, HR_ASSIGNMENT_STATUSES, REPLACEMENT_STATUS_BADGE, REPLACEMENT_STATUS_LABEL,
  type AssignmentEntry, type ReplacementCandidate, type ReplacementEntry,
} from "@/lib/hr/planning";

type Option = { id: string; label: string };

function AssignmentFields({ prefix, employees, referential, entry }: { prefix: string; employees: Option[]; referential: HrReferential; entry?: AssignmentEntry }) {
  const site = (id: string) => referential.sites.find((s) => s.id === id)?.name ?? "";
  return <>
    <div className="grid min-w-0 gap-2"><label htmlFor={`${prefix}-employee`} className={labelClass}>Collaborateur</label>
      <select id={`${prefix}-employee`} name="employeeId" defaultValue={entry?.employee_id ?? ""} required className={fieldClass}>
        <option value="">Sélectionner</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        {entry && !employees.some((e) => e.id === entry.employee_id) ? <option value={entry.employee_id}>{entry.full_name}</option> : null}
      </select></div>
    <div className="grid min-w-0 gap-2"><label htmlFor={`${prefix}-site`} className={labelClass}>Site</label>
      <select id={`${prefix}-site`} name="siteId" defaultValue={entry?.site_id ?? ""} required className={fieldClass}>
        <option value="">Sélectionner</option>{referential.sites.filter((s) => s.is_active || s.id === entry?.site_id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
      </select></div>
    <div className="grid min-w-0 gap-2"><label htmlFor={`${prefix}-team`} className={labelClass}>Équipe (facultatif)</label>
      <select id={`${prefix}-team`} name="teamId" defaultValue={entry?.team_id ?? ""} className={fieldClass}>
        <option value="">Aucune</option>{referential.teams.filter((t) => t.is_active || t.id === entry?.team_id).map((t) => <option key={t.id} value={t.id}>{t.name} — {site(t.site_id)}</option>)}
      </select></div>
    <div className="grid min-w-0 gap-2"><label htmlFor={`${prefix}-status`} className={labelClass}>Statut</label>
      <select id={`${prefix}-status`} name="status" defaultValue={entry?.status ?? "ACTIVE"} className={fieldClass}>{HR_ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{ASSIGNMENT_STATUS_LABEL[s]}</option>)}</select></div>
    <Input id={`${prefix}-start`} label="Début" name="startDate" type="date" defaultValue={entry?.start_date ?? ""} required />
    <Input id={`${prefix}-end`} label="Fin (facultative)" name="endDate" type="date" defaultValue={entry?.end_date ?? ""} hint="Obligatoire pour une affectation terminée." />
  </>;
}

/** Assignments grouped by site, readable as a list on mobile; editing only when actions are provided. */
export function AssignmentBoard({ entries, employees, referential, saveAction }: {
  entries: AssignmentEntry[]; employees?: Option[]; referential?: HrReferential; saveAction?: (form: FormData) => Promise<AdminFormResult>;
}) {
  const bySite = new Map<string, AssignmentEntry[]>();
  for (const entry of entries) bySite.set(entry.site_name, [...(bySite.get(entry.site_name) ?? []), entry]);
  const editable = !!(saveAction && employees && referential);
  return <div className="grid gap-6">
    {editable ? <details className="rounded-2xl border border-border bg-surface p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Plus className="size-4" aria-hidden="true" />Nouvelle affectation</summary>
      <AdminForm action={saveAction} label="Nouvelle affectation" resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="assignmentId" value="" /><input type="hidden" name="revision" value="" />
        <AssignmentFields prefix="new-assignment" employees={employees} referential={referential} />
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit"><Plus className="size-4" aria-hidden="true" />Créer l’affectation</Button></div>
      </AdminForm></details> : null}
    {!entries.length ? <EmptyState icon={CalendarRange} headingLevel={3} title="Aucune affectation." /> : null}
    {[...bySite.entries()].map(([siteName, siteEntries]) => <section key={siteName} aria-label={`Site ${siteName}`} className="grid gap-3">
      <h3 className="flex items-center gap-2 font-display font-semibold"><MapPin className="size-4 text-primary" aria-hidden="true" />{siteName}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{siteEntries.filter((e) => e.status === "ACTIVE").length} active(s)</span></h3>
      <ul className="grid gap-3 lg:grid-cols-2">{siteEntries.map((entry) => <li key={entry.id} className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3"><Avatar name={entry.full_name} /><div className="min-w-0 [overflow-wrap:anywhere]"><p className="font-semibold">{entry.full_name}</p>
            <p className="text-xs text-muted-foreground"><span className="font-mono">{entry.matricule}</span>{entry.team_name ? ` · ${entry.team_name}` : ""}</p></div></div>
          <StatusBadge status={ASSIGNMENT_STATUS_BADGE[entry.status]} label={ASSIGNMENT_STATUS_LABEL[entry.status]} />
        </div>
        <p className="text-sm"><CalendarRange className="mr-1 inline size-4 align-text-bottom text-muted-foreground" aria-hidden="true" />{formatDay(entry.start_date)} → {entry.end_date ? formatDay(entry.end_date) : "sans date de fin"}</p>
        {editable ? <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold">Modifier</summary>
          <AdminForm action={saveAction} label={`Modifier l’affectation de ${entry.full_name}`} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="assignmentId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} />
            <AssignmentFields prefix={`assignment-${entry.id}`} employees={employees} referential={referential} entry={entry} />
            <div className="sm:col-span-2"><Button type="submit" size="sm" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
          </AdminForm></details> : null}
      </li>)}</ul>
    </section>)}
  </div>;
}

/** Replacement needs; open needs offer the eligible candidates computed by the database. */
export function ReplacementBoard({ entries, candidates, confirmAction, cancelAction }: {
  entries: ReplacementEntry[]; candidates?: Record<string, ReplacementCandidate[]>;
  confirmAction?: (form: FormData) => Promise<AdminFormResult>; cancelAction?: (form: FormData) => Promise<AdminFormResult>;
}) {
  if (!entries.length) return <EmptyState icon={ArrowRightLeft} headingLevel={3} title="Aucun remplacement." />;
  return <ul className="grid gap-3 lg:grid-cols-2">{entries.map((entry) => {
    const options = candidates?.[entry.id] ?? [];
    return <li key={entry.id} className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 [overflow-wrap:anywhere]"><p className="font-semibold">Absence de {entry.absent_name}</p>
          <p className="text-sm text-muted-foreground"><MapPin className="mr-1 inline size-3.5" aria-hidden="true" />{entry.site_name} · {formatDay(entry.start_date)} → {formatDay(entry.end_date)}</p></div>
        <StatusBadge status={REPLACEMENT_STATUS_BADGE[entry.status]} label={REPLACEMENT_STATUS_LABEL[entry.status]} />
      </div>
      {entry.replacement_name ? <p className="flex items-center gap-2 text-sm"><UserCheck className="size-4 text-success" aria-hidden="true" />Remplaçant : <span className="font-semibold">{entry.replacement_name}</span></p> : null}
      {entry.status === "OPEN" && confirmAction ? <AdminForm action={confirmAction} label={`Confirmer un remplaçant pour ${entry.absent_name}`} className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="replacementId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} />
        <div className="grid min-w-0 gap-2"><label htmlFor={`candidate-${entry.id}`} className={labelClass}>Remplaçant disponible</label>
          <select id={`candidate-${entry.id}`} name="replacementEmployeeId" required className={fieldClass} disabled={!options.length}>
            <option value="">{options.length ? "Sélectionner" : "Aucun collaborateur disponible"}</option>
            {options.map((c) => <option key={c.employee_id} value={c.employee_id}>{c.full_name} — {c.job_title} ({c.site_name})</option>)}
          </select></div>
        <Button type="submit" size="sm" disabled={!options.length}><UserCheck className="size-4" aria-hidden="true" />Confirmer</Button>
      </AdminForm> : null}
      {entry.status !== "CANCELLED" && cancelAction ? <AdminForm action={cancelAction} label={`Annuler le besoin de remplacement de ${entry.absent_name}`}>
        <input type="hidden" name="replacementId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} />
        <Button type="submit" size="sm" variant="ghost">Annuler ce besoin</Button>
      </AdminForm> : null}
    </li>;
  })}</ul>;
}

/** Shared page section: a titled panel wrapping both boards. */
export function PlanningSection({ title, description, children, id, icon = CalendarRange }: { title: string; description: string; children: React.ReactNode; id: string; icon?: typeof CalendarRange }) {
  return <Panel icon={icon} tone="primary" title={title} titleId={id} description={description}>{children}</Panel>;
}
