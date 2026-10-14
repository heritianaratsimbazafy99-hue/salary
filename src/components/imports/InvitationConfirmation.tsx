"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import type { InvitationCandidate } from "@/lib/employees/invitations";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Surface";

export function InvitationConfirmation({ candidates }: { candidates: InvitationCandidate[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  return <section className="grid gap-3" aria-label="Destinataires de la publication">
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-teal/12 text-teal"><Users className="size-5" aria-hidden="true" /></span>
      <h3 className="font-display text-lg font-semibold">{candidates.length} destinataires</h3>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">Toutes les fiches valides seront publiées. Chaque salarié recevra un email ; les nouveaux salariés recevront un lien d’activation. Les lignes invalides sont exclues.</p>
    <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-surface-elevated">
      {candidates.slice(page * pageSize, (page + 1) * pageSize).map((candidate) => <li key={candidate.employeeId} className="flex min-w-0 items-center gap-3 break-words px-3 py-2.5 text-sm">
        <Avatar name={candidate.employeeName} size="sm" />
        <span className="min-w-0 break-words"><span className="break-words font-medium">{candidate.employeeName}</span> · {candidate.employeeId}<span className="block break-all text-xs text-muted-foreground">{candidate.email}</span></span>
      </li>)}
    </ul>
    {candidates.length > pageSize ? <nav aria-label="Pages des destinataires" className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" />Destinataires précédents</Button>
      <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">{page + 1} / {Math.ceil(candidates.length / pageSize)}</span>
      <Button type="button" size="sm" variant="secondary" disabled={(page + 1) * pageSize >= candidates.length} onClick={() => setPage(page + 1)}>Destinataires suivants<ChevronRight className="size-4" aria-hidden="true" /></Button>
    </nav> : null}
  </section>;
}
