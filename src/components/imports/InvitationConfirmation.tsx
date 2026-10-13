"use client";
import { useState } from "react";
import type { InvitationCandidate } from "@/lib/employees/invitations";
import { Button } from "@/components/ui/Button";

export function InvitationConfirmation({ candidates }: { candidates: InvitationCandidate[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  return <section className="space-y-3" aria-label="Destinataires de la publication">
    <h3 className="font-display text-lg font-semibold">{candidates.length} destinataires</h3>
    <p className="text-sm text-muted-foreground">Toutes les fiches valides seront publiées. Chaque salarié recevra un email ; les nouveaux salariés recevront un lien d’activation. Les lignes invalides sont exclues.</p>
    <ul className="max-h-80 overflow-y-auto divide-y divide-border">
      {candidates.slice(page * pageSize, (page + 1) * pageSize).map((candidate) => <li key={candidate.employeeId} className="min-w-0 break-words py-2 text-sm"><span className="break-words font-medium">{candidate.employeeName}</span> · {candidate.employeeId}<span className="block break-all text-muted-foreground">{candidate.email}</span></li>)}
    </ul>
    {candidates.length > pageSize ? <nav aria-label="Pages des destinataires" className="flex items-center gap-3"><Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Destinataires précédents</Button><span>{page + 1} / {Math.ceil(candidates.length / pageSize)}</span><Button type="button" variant="secondary" disabled={(page + 1) * pageSize >= candidates.length} onClick={() => setPage(page + 1)}>Destinataires suivants</Button></nav> : null}
  </section>;
}
