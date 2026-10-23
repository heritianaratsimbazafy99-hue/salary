import Link from "next/link";
import { Contact, Search } from "lucide-react";
import { EmployeeList } from "@/components/agency-employees/EmployeeList";
import { getAgencyPageActor } from "@/components/agency-employees/PageAccess";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Surface";
import { listAgencyEmployees } from "@/lib/employees/agency-management";
export const dynamic = "force-dynamic";
export default async function AgencyEmployeesPage({ searchParams }: { searchParams?: Promise<{ q?: string; state?: string; page?: string }> }) {
  const actor = await getAgencyPageActor(); if (!actor) return <AccessDenied context="Salariés de l’agence" />;
  const params = await searchParams ?? {}; const directory = await listAgencyEmployees({ search: params.q, state: params.state, page: Number(params.page) || 1 });
  const href = (page: number) => `/manager/employees?${new URLSearchParams({ q: params.q ?? "", state: params.state ?? "", page: String(page) })}`;
  return <AppShell role={actor.role}><div className="grid gap-6"><PageHeader title="Salariés de mon agence" eyebrow="Mon agence" icon={Contact} description="Identité, organisation et départs. Les archives conservent les dossiers et leur historique." actions={<><Link className={buttonClasses({ variant: "secondary" })} href="/manager/employees/imports">Importer un fichier</Link><Link className={buttonClasses()} href="/manager/employees/new">Nouveau salarié</Link></>} />
    <form aria-label="Filtrer les salariés" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Input name="q" label="Nom ou matricule" defaultValue={params.q} maxLength={160} /><div className="grid gap-2"><label className={labelClass} htmlFor="employee-state">Effectif</label><select id="employee-state" name="state" className={fieldClass} defaultValue={params.state ?? ""}><option value="">Effectif actuel</option><option value="DEPARTED">Archives — départs</option><option value="TO_REVIEW">Situation à revoir avec les RH</option></select></div><Button type="submit" variant="secondary"><Search aria-hidden="true" className="size-4" />Rechercher</Button></form>
    <Panel title={`${directory.count} salarié(s)`}>{directory.entries.length ? <EmployeeList key={directory.entries.map((employee) => employee.id).join("-")} employees={directory.entries} /> : <p className="text-sm text-muted-foreground">Aucun salarié ne correspond à ces filtres.</p>}
      <nav aria-label="Pagination des salariés" className="mt-5 flex flex-wrap items-center justify-between gap-3">{directory.page > 1 ? <Link className={buttonClasses({ variant: "secondary" })} href={href(directory.page - 1)}>Précédent</Link> : <span />}<span className="text-sm">Page {directory.page}</span>{directory.page * 25 < directory.count ? <Link className={buttonClasses({ variant: "secondary" })} href={href(directory.page + 1)}>Suivant</Link> : <span />}</nav>
    </Panel></div></AppShell>;
}
