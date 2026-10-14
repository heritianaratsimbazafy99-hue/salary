import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { Building2, ChevronLeft, ChevronRight, Save, Search, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input, fieldClass, labelClass, switchClass } from "@/components/ui/Input";
import { Avatar, EmptyState, Panel } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { requireCanAssignAgencyManager } from "@/lib/admin/auth";
import { listAgencies, type Agency } from "@/lib/admin/agencies";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { createAgencyManager, listAgencyManagers, listEmployeeAccess, setEmployeeAccess, updateAgencyManager } from "@/lib/admin/users";
export const dynamic = "force-dynamic";
const text = (form: FormData, name: string) => String(form.get(name) || "");
async function saveManager(form: FormData): Promise<AdminFormResult> {
  "use server";
  try {
    const input = { agencyId: text(form, "agencyId"), fullName: text(form, "fullName") };
    if (form.get("id")) await updateAgencyManager({ ...input, id: text(form, "id"), isActive: form.get("isActive") === "on" });
    else await createAgencyManager({ ...input, email: text(form, "email") });
  } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath("/hr/users");
  return { success: "Responsable enregistré. Il peut se connecter avec son adresse professionnelle." };
}
async function changeEmployeeAccess(form: FormData): Promise<AdminFormResult> {
  "use server";
  try { await setEmployeeAccess({ id: text(form, "id"), isActive: text(form, "isActive") === "true" }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath("/hr/users");
  return { success: "Accès salarié mis à jour." };
}
function AgencySelect({ agencies, value = "", id, activeOnly = false }: { agencies: Agency[]; value?: string; id: string; activeOnly?: boolean }) {
  return <div className="grid min-w-0 gap-2"><label htmlFor={id} className={labelClass}>Agence</label>
    <select id={id} name="agencyId" defaultValue={value} required className={fieldClass}>
      <option value="">Sélectionner</option>{agencies.filter((a) => !activeOnly || a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code}){a.is_active ? "" : " — inactive"}</option>)}
    </select></div>;
}
export default async function UsersPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string; q?: string; page?: string }> }) {
  let role: Awaited<ReturnType<typeof requireCanAssignAgencyManager>>;
  try { role = await requireCanAssignAgencyManager(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Administration RH" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [agencies, managers, result] = await Promise.all([listAgencies(), listAgencyManagers(), listEmployeeAccess(params.agencyId, params.q, page)]);
  const activeAgencies = agencies.filter((a) => a.is_active);
  const pageUrl = (next: number) => `/hr/users?${new URLSearchParams({ agencyId: params.agencyId ?? "", q: params.q ?? "", page: String(next) })}`;
  const agencyName = (id: string) => agencies.find((a) => a.id === id)?.name ?? "Agence";
  const activeManagers = managers.filter((manager) => manager.is_active).length;
  const pageCount = Math.max(1, Math.ceil(result.count / 25));
  return <AppShell role={role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Administration RH" title="Responsables d’agence" icon={Users} description="Gérez les affectations et retirez les accès sans supprimer les données de paie.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={UserCog} label="Responsables" value={managers.length} />
        <HeaderStat icon={ShieldCheck} label="Actifs" value={activeManagers} />
        <HeaderStat icon={Users} label="Salariés" value={result.count} />
      </div>
    </PageHeader>
    <Panel icon={UserPlus} tone="accent" title="Nouveau responsable" titleId="new-manager" description="Il pourra se connecter avec son adresse professionnelle, par lien magique.">
      <AdminForm action={saveManager} label="Nouveau responsable" resetOnSuccess className="grid gap-4 lg:grid-cols-[1fr_1fr_16rem_auto] lg:items-end">
        <Input label="Email professionnel" name="email" type="email" required placeholder="nom@entreprise.com" /><Input label="Nom complet" name="fullName" maxLength={160} required />
        <AgencySelect agencies={activeAgencies} id="new-manager-agency" /><Button disabled={!activeAgencies.length} type="submit"><UserPlus className="size-4" aria-hidden="true" />Créer</Button>
      </AdminForm>
      {!activeAgencies.length ? <p className="mt-4 text-sm">Créez ou réactivez une agence avant d’ajouter un responsable.</p> : null}
    </Panel>
    <section aria-labelledby="managers" className="grid min-w-0 grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="managers" className="font-display text-lg font-semibold">Responsables enregistrés</h2><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{managers.length} responsable(s)</span></div>
      <p className="text-sm leading-6 text-muted-foreground">Le retrait d’accès ou le changement d’agence prend effet sur les sessions ouvertes. Les comptes RH et super administrateurs ne sont pas modifiables ici.</p>
      <div className="stagger grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {managers.map((manager) => <article key={manager.id} className={`min-w-0 rounded-3xl border bg-surface p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] ${manager.is_active ? "border-border/80" : "border-dashed border-border bg-surface/70"}`}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Avatar name={manager.full_name} size="lg" /><div className="min-w-0 max-w-full [overflow-wrap:anywhere]"><h3 className="font-display font-semibold">{manager.full_name}</h3><p className="text-sm text-muted-foreground">{manager.email}</p></div></div><StatusBadge status={manager.is_active ? "ACTIVE" : "INACTIVE"} /></div>
          <AdminForm action={saveManager} label={`Modifier le responsable ${manager.email}`} className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <input type="hidden" name="id" value={manager.id} /><Input id={`manager-${manager.id}`} label="Nom complet" name="fullName" defaultValue={manager.full_name} maxLength={160} required />
            <AgencySelect agencies={agencies} value={manager.agency_memberships[0]?.agency_id} id={`agency-${manager.id}`} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 sm:col-span-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input className={switchClass} type="checkbox" name="isActive" defaultChecked={manager.is_active} />Accès actif</label>
              <Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button>
            </div>
          </AdminForm>
        </article>)}
      </div>
      {!managers.length ? <EmptyState icon={UserCog} headingLevel={3} title="Aucun responsable enregistré." /> : null}
    </section>
    <Panel icon={Users} tone="teal" title="Accès des salariés" titleId="employees" description="En cas de départ, désactivez l’accès dans l’agence concernée. Ses bulletins deviennent immédiatement inaccessibles, même dans une session ouverte. Les éventuelles autres affectations actives restent accessibles. Aucun historique n’est supprimé.">
      <div className="grid gap-4">
        <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface-elevated p-4 [&>div]:min-w-0 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Rechercher des salariés">
          <Input label="Rechercher par nom" name="q" defaultValue={params.q ?? ""} maxLength={160} placeholder="Nom du salarié" />
          <div className="grid min-w-0 gap-2"><label htmlFor="employee-agency" className={labelClass}>Agence des salariés</label><select id="employee-agency" name="agencyId" defaultValue={params.agencyId ?? ""} className={fieldClass}><option value="">Toutes les agences</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><Button type="submit" variant="secondary"><Search className="size-4" aria-hidden="true" />Rechercher</Button>
        </form>
        <p className="text-sm font-medium text-muted-foreground">{result.count} salarié(s) — page {page}</p>
        <ul className="stagger grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          {result.employees.map((employee) => <li key={employee.id}><article className={`flex h-full flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 transition hover:shadow-[var(--shadow-sm)] ${employee.is_active ? "border-border bg-surface" : "border-dashed border-border bg-muted/40"}`}>
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-3 [overflow-wrap:anywhere]"><Avatar name={employee.full_name} /><div className="min-w-0"><h3 className="font-semibold">{employee.full_name}</h3><p className="text-sm text-muted-foreground">{employee.employee_id} · {employee.email}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span className="inline-flex items-center gap-1 text-muted-foreground"><Building2 className="size-3.5" aria-hidden="true" />{agencyName(employee.agency_id)}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${employee.is_active ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}`}>{employee.is_active ? "Accès actif" : "Accès désactivé"}</span></p></div></div>
            <AdminForm action={changeEmployeeAccess} label={`Accès de ${employee.full_name}`} className="grid gap-2">
              <input type="hidden" name="id" value={employee.id} /><input type="hidden" name="isActive" value={String(!employee.is_active)} />
              <Button type="submit" size="sm" variant={employee.is_active ? "danger" : "secondary"}>{employee.is_active ? "Désactiver l’accès" : "Réactiver l’accès"}</Button>
            </AdminForm>
          </article></li>)}
        </ul>
        {!result.employees.length ? <EmptyState icon={Search} headingLevel={3} title="Aucun salarié correspondant." description="Modifiez le nom recherché ou l'agence sélectionnée." /> : null}
        <nav aria-label="Pages des salariés" className="flex flex-wrap items-center justify-center gap-3 text-sm">{page > 1 ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageUrl(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" />Précédente</Link> : null}{result.count > 25 ? <span className="rounded-full bg-muted px-3 py-1 font-semibold tabular-nums text-muted-foreground">{page} / {pageCount}</span> : null}{page * 25 < result.count ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageUrl(page + 1)}>Suivante<ChevronRight className="size-4" aria-hidden="true" /></Link> : null}</nav>
      </div>
    </Panel>
  </div></AppShell>;
}
