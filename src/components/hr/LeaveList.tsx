import { CalendarDays, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDay } from "@/components/ui/format";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Avatar, EmptyState } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { LEAVE_STATUS_BADGE, LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/hr/labels";
import type { LeaveEntry } from "@/lib/hr/leaves";

/**
 * Leave requests as cards (readable on mobile and desktop). Reasons only render
 * when the database returned them (HR and the employee; never team managers).
 */
export function LeaveList({ entries, showEmployee = true, renderActions, emptyTitle = "Aucune demande." }: {
  entries: LeaveEntry[]; showEmployee?: boolean; renderActions?: (entry: LeaveEntry) => React.ReactNode; emptyTitle?: string;
}) {
  if (!entries.length) return <EmptyState icon={CalendarDays} headingLevel={3} title={emptyTitle} />;
  return <ul className="grid gap-3 lg:grid-cols-2">{entries.map((entry) => <li key={entry.id} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      {showEmployee ? <div className="flex min-w-0 items-center gap-3"><Avatar name={entry.full_name} /><div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="font-semibold">{entry.full_name}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{entry.matricule}</span>{entry.site_name ? ` · ${entry.site_name}` : ""}</p></div></div>
        : <p className="font-semibold">{LEAVE_TYPE_LABEL[entry.leave_type]}</p>}
      <StatusBadge status={LEAVE_STATUS_BADGE[entry.status]} label={LEAVE_STATUS_LABEL[entry.status]} />
    </div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      {showEmployee ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Type</dt><dd>{LEAVE_TYPE_LABEL[entry.leave_type]}</dd></div> : null}
      <div><dt className="text-xs text-muted-foreground">Période</dt><dd>{formatDay(entry.start_date)} → {formatDay(entry.end_date)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Jours ouvrés</dt><dd className="font-semibold tabular-nums">{entry.days}</dd></div>
      {entry.balance_days !== null && entry.leave_type === "PAID_LEAVE" && entry.status === "PENDING" ? <div><dt className="text-xs text-muted-foreground">Solde actuel</dt><dd className="tabular-nums">{entry.balance_days} j</dd></div> : null}
      {entry.reason ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Motif</dt><dd className="[overflow-wrap:anywhere]">{entry.reason}</dd></div> : null}
      {entry.decided_at ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Décision</dt><dd className="[overflow-wrap:anywhere]">{entry.decided_by_name ?? "—"} · {formatDay(entry.decided_at.slice(0, 10))}{entry.decision_reason ? ` — ${entry.decision_reason}` : ""}</dd></div> : null}
    </dl>
    {renderActions?.(entry)}
  </li>)}</ul>;
}

/** Approve / refuse forms for a pending request (HR or in-scope team manager). */
export function LeaveDecisionForms({ entry, action }: { entry: LeaveEntry; action: (form: FormData) => Promise<AdminFormResult> }) {
  if (entry.status !== "PENDING") return null;
  return <div className="grid gap-3 border-t border-border pt-3">
    <AdminForm action={action} label={`Approuver la demande de ${entry.full_name}`}>
      <input type="hidden" name="leaveId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} /><input type="hidden" name="approve" value="true" /><input type="hidden" name="decisionReason" value="" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm"><CheckCircle2 className="size-4" aria-hidden="true" />Approuver</Button>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="replacementNeeded" className="size-4 accent-[hsl(var(--primary))]" />Créer un besoin de remplacement</label>
      </div>
    </AdminForm>
    <details><summary className="cursor-pointer text-sm font-semibold text-danger">Refuser</summary>
      <AdminForm action={action} label={`Refuser la demande de ${entry.full_name}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="leaveId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} /><input type="hidden" name="approve" value="false" />
        <Input id={`refuse-${entry.id}`} label="Motif du refus" name="decisionReason" maxLength={2000} required />
        <Button type="submit" size="sm" variant="danger"><XCircle className="size-4" aria-hidden="true" />Confirmer le refus</Button>
      </AdminForm>
    </details>
  </div>;
}

/** Motivated cancellation (pending by the employee; pending or approved by HR). */
export function LeaveCancelForm({ entry, action, label = "Annuler" }: { entry: LeaveEntry; action: (form: FormData) => Promise<AdminFormResult>; label?: string }) {
  return <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold text-danger">{label}</summary>
    <AdminForm action={action} label={`Annuler la demande du ${formatDay(entry.start_date)}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="leaveId" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} />
      <Input id={`cancel-${entry.id}`} label="Motif de l’annulation" name="reason" minLength={3} maxLength={2000} required />
      <Button type="submit" size="sm" variant="danger">Confirmer l’annulation</Button>
    </AdminForm>
  </details>;
}
