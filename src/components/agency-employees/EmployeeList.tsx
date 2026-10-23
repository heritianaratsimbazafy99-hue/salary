"use client";
import Link from "next/link";
import { useState } from "react";
import type { AgencyEmployee } from "@/lib/employees/agency-management";
import { AgencyInvitationButton } from "@/components/employees/AgencyInvitationButton";
export function EmployeeList({ employees }: { employees: AgencyEmployee[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = employees.filter((employee) => employee.is_active && !employee.has_access && employee.state === "CURRENT");
  const selection = eligible.filter((employee) => selected.includes(employee.id));
  return <div className="grid gap-5"><ul className="grid gap-3">{employees.map((employee) => <li key={employee.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
    {eligible.some((candidate) => candidate.id === employee.id) ? <label className="flex min-h-11 shrink-0 items-center"><input type="checkbox" aria-label={`Inviter ${employee.full_name} — ${employee.email}`} checked={selected.includes(employee.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, employee.id] : previous.filter((id) => id !== employee.id))} /></label> : null}
    <Link href={`/manager/employees/${employee.id}`} className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="min-w-0"><strong className="block break-words">{employee.full_name}</strong><span className="block text-sm text-muted-foreground">{employee.matricule} · {employee.job_title ?? "Poste à compléter"}</span><span className="block break-all text-sm text-muted-foreground">{employee.email}</span></span><span className="text-sm">{employee.state === "DEPARTED" ? `Départ : ${employee.departed_on}` : employee.state === "TO_REVIEW" ? "Situation à revoir" : "Effectif actuel"}{!employee.has_hr_record ? " · Dossier RH à compléter" : ""}</span></Link>
  </li>)}</ul>{selection.length ? <section aria-label="Invitations de la sélection" className="grid gap-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Destinataires sélectionnés</h3><ul className="grid gap-1 text-sm">{selection.map((employee) => <li key={employee.id} className="break-all">{employee.full_name} — {employee.email}</li>)}</ul><AgencyInvitationButton employeeIds={selection.map((employee) => employee.id)} /></section> : <p className="text-sm text-muted-foreground">Cochez les salariés de l’effectif actuel sans compte pour leur envoyer explicitement une invitation. Les situations à revoir nécessitent une intervention RH.</p>}</div>;
}
