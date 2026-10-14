import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Contact, FileExclamationPoint, Search, UserPlus, Users } from "lucide-react";
import { EmployeeDirectory } from "@/components/hr/EmployeeDirectory";
import { EmployeeRecordFields, recordInput } from "@/components/hr/EmployeeRecordFields";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { countIncompleteFiles, createEmployee, listDirectory, listManagerOptions } from "@/lib/hr/employees";
import { EMPLOYEE_STATUS_LABEL, HR_EMPLOYEE_STATUSES } from "@/lib/hr/labels";
import { listHrReferential } from "@/lib/hr/referential";
export const dynamic = "force-dynamic";
type Params = { agencyId?: string; q?: string; siteId?: string; status?: string; page?: string };
async function create(form: FormData): Promise<AdminFormResult> {
  "use server";
  const text = (name: string) => String(form.get(name) ?? "");
  try {
    await createEmployee({ ...recordInput(form), agencyId: text("agencyId"), matricule: text("matricule"), email: text("email"), fullName: text("fullName") });
  } catch (error) { return { error: error instanceof Error ? error.message : "Création impossible." }; }
  revalidatePath("/hr/employees");
  return { success: "Dossier créé. Le salarié recevra ses bulletins avec ce matricule dès le prochain import de paie." };
}
export default async function EmployeesPage({ searchParams }: { searchParams?: Promise<Params> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Collaborateurs" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const agencies = await listAgencies();
  const agency = agencies.find((a) => a.id === params.agencyId) ?? agencies.find((a) => a.is_active) ?? agencies[0];
  if (!agency) return <AppShell role={actor.role}><EmptyState icon={Users} title="Aucune agence enregistrée." description="Créez d’abord une agence." /></AppShell>;
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [referential, managers, directory, incomplete] = await Promise.all([
    listHrReferential(agency.id), listManagerOptions(agency.id),
    listDirectory({ agencyId: agency.id, search: params.q, siteId: params.siteId, status: params.status, page }),
    countIncompleteFiles(agency.id),
  ]);
  const pageHref = (next: number) => `/hr/employees?${new URLSearchParams({ agencyId: agency.id, q: params.q ?? "", siteId: params.siteId ?? "", status: params.status ?? "", page: String(next) })}`;
  const canCreate = agency.is_active && referential.sites.some((s) => s.is_active) && referential.departments.some((d) => d.is_active);
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Ressources humaines" title="Collaborateurs" icon={Contact} description="Dossiers, contrats et suivi administratif. L’identité (nom, email, matricule) est celle de la paie ; le dossier RH complète la même fiche salarié.">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <HeaderStat icon={Users} label="Collaborateurs" value={directory.count} />
        <HeaderStat icon={FileExclamationPoint} label="Dossiers à compléter" value={incomplete} />
      </div>
    </PageHeader>
    <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end" aria-label="Rechercher des collaborateurs">
      <div className="grid min-w-0 gap-2"><label htmlFor="employees-agency" className={labelClass}>Agence</label>
        <select id="employees-agency" name="agencyId" defaultValue={agency.id} className={fieldClass}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <Input id="employees-search" label="Nom ou matricule" name="q" defaultValue={params.q ?? ""} maxLength={160} />
      <div className="grid min-w-0 gap-2"><label htmlFor="employees-site" className={labelClass}>Site</label>
        <select id="employees-site" name="siteId" defaultValue={params.siteId ?? ""} className={fieldClass}><option value="">Tous les sites</option>{referential.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="grid min-w-0 gap-2"><label htmlFor="employees-status" className={labelClass}>Statut</label>
        <select id="employees-status" name="status" defaultValue={params.status ?? ""} className={fieldClass}><option value="">Tous les statuts</option>{HR_EMPLOYEE_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYEE_STATUS_LABEL[s]}</option>)}</select></div>
      <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden="true" />Rechercher</Button>
    </form>
    <Panel icon={UserPlus} tone="accent" title="Nouveau collaborateur" titleId="new-employee" description="Pour une personne pas encore présente dans la paie. Si le salarié existe déjà, ouvrez sa fiche et complétez son dossier.">
      {canCreate ? <details><summary className="cursor-pointer text-sm font-semibold">Créer un dossier dans {agency.name}</summary>
        <AdminForm action={create} label="Nouveau collaborateur" resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="agencyId" value={agency.id} />
          <Input id="new-employee-matricule" label="Matricule paie" name="matricule" maxLength={64} required hint="Identifiant utilisé dans les fichiers de paie." />
          <Input id="new-employee-name" label="Nom complet" name="fullName" maxLength={160} required />
          <Input id="new-employee-email" label="Email de connexion" name="email" type="email" maxLength={254} required />
          <EmployeeRecordFields prefix="new-employee" referential={referential} managers={managers} />
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit"><UserPlus className="size-4" aria-hidden="true" />Créer le dossier</Button></div>
        </AdminForm>
      </details> : <p className="text-sm text-muted-foreground">Ajoutez au moins un site et un département actifs dans Organisation pour créer un dossier.</p>}
    </Panel>
    <section aria-labelledby="directory" className="grid min-w-0 gap-4">
      <h2 id="directory" className="font-display text-lg font-semibold">Annuaire — {agency.name}</h2>
      <EmployeeDirectory entries={directory.entries} count={directory.count} page={page} pageHref={pageHref} hrefFor={(entry) => `/hr/employees/${entry.employee_id}`} />
    </section>
  </div></AppShell>;
}
