import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  return <div className="grid min-w-0 gap-2"><label htmlFor={id} className="text-sm font-medium">Agence</label>
    <select id={id} name="agencyId" defaultValue={value} required className="h-10 w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 text-sm">
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
  return <AppShell role={role}><div className="flex flex-col gap-8">
    <PageHeader eyebrow="Administration RH" title="Responsables d’agence" description="Gérez les affectations et retirez les accès sans supprimer les données de paie." />
    <section aria-labelledby="new-manager" className="rounded-2xl border border-border bg-surface p-6">
      <h2 id="new-manager" className="font-display font-semibold">Nouveau responsable</h2>
      <AdminForm action={saveManager} label="Nouveau responsable" resetOnSuccess className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_16rem_auto] lg:items-end">
        <Input label="Email professionnel" name="email" type="email" required /><Input label="Nom complet" name="fullName" maxLength={160} required />
        <AgencySelect agencies={activeAgencies} id="new-manager-agency" /><Button disabled={!activeAgencies.length} type="submit">Créer</Button>
      </AdminForm>
      {!activeAgencies.length ? <p className="mt-4 text-sm">Créez ou réactivez une agence avant d’ajouter un responsable.</p> : null}
    </section>
    <section aria-labelledby="managers" className="grid min-w-0 grid-cols-1 gap-4">
      <h2 id="managers" className="font-display font-semibold">Responsables enregistrés</h2>
      <p className="text-sm text-muted-foreground">Le retrait d’accès ou le changement d’agence prend effet sur les sessions ouvertes. Les comptes RH et super administrateurs ne sont pas modifiables ici.</p>
      {managers.map((manager) => <article key={manager.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 max-w-full [overflow-wrap:anywhere]"><h3 className="font-semibold">{manager.full_name}</h3><p className="text-sm text-muted-foreground">{manager.email}</p></div><StatusBadge status={manager.is_active ? "ACTIVE" : "INACTIVE"} /></div>
        <AdminForm action={saveManager} label={`Modifier le responsable ${manager.email}`} className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <input type="hidden" name="id" value={manager.id} /><Input id={`manager-${manager.id}`} label="Nom complet" name="fullName" defaultValue={manager.full_name} maxLength={160} required />
          <AgencySelect agencies={agencies} value={manager.agency_memberships[0]?.agency_id} id={`agency-${manager.id}`} />
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={manager.is_active} />Accès actif</label>
          <Button type="submit" variant="secondary">Enregistrer</Button>
        </AdminForm>
      </article>)}
      {!managers.length ? <p className="text-sm text-muted-foreground">Aucun responsable enregistré.</p> : null}
    </section>
    <section aria-labelledby="employees" className="grid min-w-0 grid-cols-1 gap-4">
      <h2 id="employees" className="font-display font-semibold">Accès des salariés</h2>
      <p className="text-sm text-muted-foreground">En cas de départ, désactivez l’accès dans l’agence concernée. Ses bulletins deviennent immédiatement inaccessibles, même dans une session ouverte. Les éventuelles autres affectations actives restent accessibles. Aucun historique n’est supprimé.</p>
      <form className="grid min-w-0 grid-cols-1 gap-3 [&>div]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Rechercher des salariés">
        <Input label="Rechercher par nom" name="q" defaultValue={params.q ?? ""} maxLength={160} />
        <div className="grid min-w-0 gap-2"><label htmlFor="employee-agency" className="text-sm font-medium">Agence des salariés</label><select id="employee-agency" name="agencyId" defaultValue={params.agencyId ?? ""} className="h-10 w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">Toutes les agences</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><Button type="submit" variant="secondary">Rechercher</Button>
      </form>
      <p className="text-sm text-muted-foreground">{result.count} salarié(s) — page {page}</p>
      {result.employees.map((employee) => <article key={employee.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0 max-w-full [overflow-wrap:anywhere]"><h3 className="font-semibold">{employee.full_name}</h3><p className="text-sm text-muted-foreground">{employee.employee_id} · {employee.email}</p><p className="text-sm">{agencies.find((a) => a.id === employee.agency_id)?.name ?? "Agence"} · {employee.is_active ? "Accès actif" : "Accès désactivé"}</p></div>
        <AdminForm action={changeEmployeeAccess} label={`Accès de ${employee.full_name}`} className="grid gap-2">
          <input type="hidden" name="id" value={employee.id} /><input type="hidden" name="isActive" value={String(!employee.is_active)} />
          <Button type="submit" variant="secondary">{employee.is_active ? "Désactiver l’accès" : "Réactiver l’accès"}</Button>
        </AdminForm>
      </article>)}
      {!result.employees.length ? <p className="text-sm text-muted-foreground">Aucun salarié correspondant.</p> : null}
      <nav aria-label="Pages des salariés" className="flex gap-4 text-sm text-primary">{page > 1 ? <Link href={pageUrl(page - 1)}>Précédente</Link> : null}{page * 25 < result.count ? <Link href={pageUrl(page + 1)}>Suivante</Link> : null}</nav>
    </section>
  </div></AppShell>;
}
