type Candidate = {
  employeeId: string;
  email: string;
  employeeName: string;
};

export function InvitationConfirmation({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun nouveau salarie a inviter.</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Nouveaux salaries detectes</h2>
      {candidates.map((candidate) => (
        <label key={candidate.employeeId} className="flex items-center gap-3 rounded border border-border p-3 text-sm">
          <input type="checkbox" name="inviteEmployeeId" value={candidate.employeeId} defaultChecked />
          <span>
            <span className="font-medium">{candidate.employeeName}</span>
            <span className="block text-muted-foreground">{candidate.email}</span>
          </span>
        </label>
      ))}
    </section>
  );
}
