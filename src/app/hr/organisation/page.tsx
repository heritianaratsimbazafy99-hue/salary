import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Building2, Layers, MapPin, Network, Plus, Save, UsersRound } from "lucide-react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass, switchClass } from "@/components/ui/Input";
import { Callout, EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies } from "@/lib/admin/agencies";
import { requireCanManageHrReferential } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { listHrReferential, saveHrDepartment, saveHrSite, saveHrTeam, type HrSite } from "@/lib/hr/referential";
export const dynamic = "force-dynamic";
const text = (form: FormData, name: string) => String(form.get(name) || "");
const revision = (form: FormData) => Number.parseInt(text(form, "revision"), 10) || undefined;
async function run(task: () => Promise<void>, success: string): Promise<AdminFormResult> {
  try { await task(); } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath("/hr/organisation"); revalidatePath("/hr/access");
  return { success };
}
async function saveSite(form: FormData): Promise<AdminFormResult> {
  "use server";
  return run(() => saveHrSite({ id: text(form, "id") || undefined, revision: revision(form), agencyId: text(form, "agencyId"), name: text(form, "name"), code: text(form, "code"), isActive: form.get("isActive") === "on" }), "Site enregistré.");
}
async function saveDepartment(form: FormData): Promise<AdminFormResult> {
  "use server";
  return run(() => saveHrDepartment({ id: text(form, "id") || undefined, revision: revision(form), agencyId: text(form, "agencyId"), name: text(form, "name"), isActive: form.get("isActive") === "on" }), "Département enregistré.");
}
async function saveTeam(form: FormData): Promise<AdminFormResult> {
  "use server";
  return run(() => saveHrTeam({ id: text(form, "id") || undefined, revision: revision(form), siteId: text(form, "siteId"), name: text(form, "name"), isActive: form.get("isActive") === "on" }), "Équipe enregistrée.");
}
function ActiveSwitch({ checked, label }: { checked: boolean; label: string }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input className={switchClass} type="checkbox" name="isActive" defaultChecked={checked} />{label}</label>;
}
function SiteSelect({ sites, value, id }: { sites: HrSite[]; value?: string; id: string }) {
  return <div className="grid min-w-0 gap-2"><label htmlFor={id} className={labelClass}>Site</label>
    <select id={id} name="siteId" defaultValue={value ?? ""} required className={fieldClass}>
      <option value="">Sélectionner</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name} ({site.code}){site.is_active ? "" : " — inactif"}</option>)}
    </select></div>;
}
function ItemCard({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <li className={`min-w-0 rounded-2xl border p-4 ${active ? "border-border bg-surface" : "border-dashed border-border bg-muted/40"}`}>{children}</li>;
}
export default async function OrganisationPage({ searchParams }: { searchParams?: Promise<{ agencyId?: string }> }) {
  let actor: Awaited<ReturnType<typeof requireCanManageHrReferential>>;
  try { actor = await requireCanManageHrReferential(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Organisation RH" />;
    throw error;
  }
  const params = await searchParams ?? {};
  const agencies = await listAgencies();
  const agency = agencies.find((a) => a.id === params.agencyId) ?? agencies.find((a) => a.is_active) ?? agencies[0];
  const { sites, departments, teams } = agency ? await listHrReferential(agency.id) : { sites: [], departments: [], teams: [] };
  const activeSites = sites.filter((site) => site.is_active);
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Administration RH" title="Organisation" icon={Network} description="Sites clients, départements et équipes de chaque agence. Ils servent aux dossiers, aux affectations et aux périmètres des managers et des clients.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={MapPin} label="Sites" value={sites.length} />
        <HeaderStat icon={Layers} label="Départements" value={departments.length} />
        <HeaderStat icon={UsersRound} label="Équipes" value={teams.length} />
      </div>
    </PageHeader>
    {!agency ? <EmptyState icon={Building2} title="Aucune agence enregistrée." description="Créez d’abord une agence pour y rattacher des sites." /> : <>
      <form className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end" aria-label="Choisir une agence">
        <div className="grid min-w-0 gap-2"><label htmlFor="organisation-agency" className={labelClass}>Agence</label>
          <select id="organisation-agency" name="agencyId" defaultValue={agency.id} className={fieldClass}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code}){a.is_active ? "" : " — inactive"}</option>)}</select></div>
        <Button type="submit" variant="secondary"><Building2 className="size-4" aria-hidden="true" />Afficher</Button>
      </form>
      <Callout icon={Network} tone="teal">La désactivation d’un site ou d’un département retire immédiatement les périmètres qui en dépendent, y compris pour les sessions ouvertes. Rien n’est supprimé.</Callout>
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel icon={MapPin} tone="accent" title="Sites" titleId="sites" description={`Sites clients de ${agency.name}.`}>
          <AdminForm action={saveSite} label="Nouveau site" resetOnSuccess className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
            <input type="hidden" name="agencyId" value={agency.id} /><input type="hidden" name="isActive" value="on" />
            <Input id="new-site-name" label="Nom du site" name="name" maxLength={160} required placeholder="Ex. : Tour Zital" /><Input id="new-site-code" label="Code" name="code" maxLength={32} required placeholder="ZITAL" />
            <div className="sm:col-span-2"><Button type="submit" disabled={!agency.is_active}><Plus className="size-4" aria-hidden="true" />Ajouter</Button></div>
          </AdminForm>
          <ul className="mt-5 grid gap-3">{sites.map((site) => <ItemCard key={site.id} active={site.is_active}>
            <AdminForm action={saveSite} label={`Modifier le site ${site.name}`} className="grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-end">
              <input type="hidden" name="id" value={site.id} /><input type="hidden" name="revision" value={site.revision} /><input type="hidden" name="agencyId" value={site.agency_id} />
              <Input id={`site-name-${site.id}`} label="Nom" name="name" defaultValue={site.name} maxLength={160} required />
              <Input id={`site-code-${site.id}`} label="Code" name="code" defaultValue={site.code} maxLength={32} required />
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2"><ActiveSwitch checked={site.is_active} label="Site actif" /><Button type="submit" size="sm" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
            </AdminForm>
          </ItemCard>)}</ul>
          {!sites.length ? <EmptyState icon={MapPin} headingLevel={3} title="Aucun site." description="Ajoutez les sites où travaillent les collaborateurs." /> : null}
        </Panel>
        <Panel icon={Layers} tone="primary" title="Départements" titleId="departments" description="Regroupements métier, utilisés pour les périmètres des managers.">
          <AdminForm action={saveDepartment} label="Nouveau département" resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="agencyId" value={agency.id} /><input type="hidden" name="isActive" value="on" />
            <Input id="new-department-name" label="Nom du département" name="name" maxLength={160} required placeholder="Ex. : Service client" />
            <Button type="submit" disabled={!agency.is_active}><Plus className="size-4" aria-hidden="true" />Ajouter</Button>
          </AdminForm>
          <ul className="mt-5 grid gap-3">{departments.map((department) => <ItemCard key={department.id} active={department.is_active}>
            <AdminForm action={saveDepartment} label={`Modifier le département ${department.name}`} className="grid gap-3">
              <input type="hidden" name="id" value={department.id} /><input type="hidden" name="revision" value={department.revision} /><input type="hidden" name="agencyId" value={department.agency_id} />
              <Input id={`department-${department.id}`} label="Nom" name="name" defaultValue={department.name} maxLength={160} required />
              <div className="flex flex-wrap items-center justify-between gap-3"><ActiveSwitch checked={department.is_active} label="Département actif" /><Button type="submit" size="sm" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
            </AdminForm>
          </ItemCard>)}</ul>
          {!departments.length ? <EmptyState icon={Layers} headingLevel={3} title="Aucun département." /> : null}
        </Panel>
      </div>
      <Panel icon={UsersRound} tone="teal" title="Équipes" titleId="teams" description="Chaque équipe appartient à un site. Elle sert aux affectations et au planning.">
        <AdminForm action={saveTeam} label="Nouvelle équipe" resetOnSuccess className="grid gap-4 md:grid-cols-[16rem_1fr_auto] md:items-end">
          <input type="hidden" name="isActive" value="on" />
          <SiteSelect sites={activeSites} id="new-team-site" /><Input id="new-team-name" label="Nom de l’équipe" name="name" maxLength={160} required placeholder="Ex. : Équipe matin" />
          <Button type="submit" disabled={!activeSites.length}><Plus className="size-4" aria-hidden="true" />Ajouter</Button>
        </AdminForm>
        {!activeSites.length ? <p className="mt-3 text-sm text-muted-foreground">Ajoutez ou réactivez un site avant de créer une équipe.</p> : null}
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">{teams.map((team) => <ItemCard key={team.id} active={team.is_active}>
          <AdminForm action={saveTeam} label={`Modifier l’équipe ${team.name}`} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <input type="hidden" name="id" value={team.id} /><input type="hidden" name="revision" value={team.revision} />
            <SiteSelect sites={sites} value={team.site_id} id={`team-site-${team.id}`} />
            <Input id={`team-${team.id}`} label="Nom" name="name" defaultValue={team.name} maxLength={160} required />
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2"><ActiveSwitch checked={team.is_active} label="Équipe active" /><Button type="submit" size="sm" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
          </AdminForm>
        </ItemCard>)}</ul>
        {!teams.length ? <EmptyState icon={UsersRound} headingLevel={3} title="Aucune équipe." /> : null}
      </Panel>
    </>}
  </div></AppShell>;
}
