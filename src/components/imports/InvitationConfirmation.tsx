import type { InvitationCandidate } from "@/lib/employees/invitations";

export function InvitationConfirmation({ candidates }: { candidates: InvitationCandidate[] }) {
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun nouveau salarie a inviter.</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Nouveaux salaries detectes</h2>
      {candidates.map((candidate) => (
        <label key={candidate.employeeId} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-[var(--shadow-xs)] transition-colors hover:bg-muted/40">
          <input className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]" type="checkbox" name="inviteEmployeeId" value={candidate.employeeId} defaultChecked />
          <span className="min-w-0 flex-1">
            <span className="break-words font-medium">{candidate.employeeName}</span>
            <span className="block break-all text-muted-foreground">{candidate.email}</span>
          </span>
        </label>
      ))}
    </section>
  );
}
