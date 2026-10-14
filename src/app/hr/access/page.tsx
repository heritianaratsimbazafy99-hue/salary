import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BellRing, Eye, KeyRound, MapPin, Layers, Save, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass, switchClass } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Avatar, Callout, EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { listAgencies, type Agency } from "@/lib/admin/agencies";
import { requireCanAdministerHrAccess } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { createHrAccess, listHrAccessProfiles, setHrAccessActive, updateHrAccess, type HrAccessProfile } from "@/lib/hr/access";
import { listHrReferential, type HrReferential } from "@/lib/hr/referential";
import { listReportSubscriptions, setReportSubscription } from "@/lib/hr/reporting";
import type { HrScopedRole } from "@/lib/roles";
export const dynamic = "force-dynamic";
const ROLE_LABEL: Record<HrScopedRole, string> = { team_manager: "Manager RH", client_viewer: "Client (lecture)" };
const text = (form: FormData, name: string) => String(form.get(name) || "");
const ids = (form: FormData, name: string) => form.getAll(name).map(String).filter(Boolean);
const role = (form: FormData) => (text(form, "role") === "client_viewer" ? "client_viewer" : "team_manager") as HrScopedRole;
async function done(task: () => Promise<void>, success: string): Promise<AdminFormResult> {
  try { await task(); } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath("/hr/access");
  return { success };
}
async function createAccess(form: FormData): Promise<AdminFormResult> {
  "use server";
  return done(() => createHrAccess({ email: text(form, "email"), fullName: text(form, "fullName"), role: role(form), departmentIds: ids(form, "departmentIds"), siteIds: ids(form, "siteIds") }),
    "Accès créé. La personne peut se connecter avec son adresse, par lien magique.");
}
async function updateAccess(form: FormData): Promise<AdminFormResult> {
  "use server";
  return done(() => updateHrAccess({ id: text(form, "id"), updatedAt: text(form, "updatedAt"), fullName: text(form, "fullName"), role: role(form), isActive: form.get("isActive") === "on", departmentIds: ids(form, "departmentIds"), siteIds: ids(form, "siteIds") }),
    "Accès mis à jour. Le changement s’applique aussi aux sessions ouvertes.");
}
async function toggleAccess(form: FormData): Promise<AdminFormResult> {
  "use server";
  return done(() => setHrAccessActive({ id: text(form, "id"), updatedAt: text(form, "updatedAt"), isActive: text(form, "isActive") === "true" }), "Accès mis à jour.");
}
async function toggleSubscription(form: FormData): Promise<AdminFormResult> {
  "use server";
  return done(() => setReportSubscription({ profileId: text(form, "profileId"), kind: text(form, "kind"), agencyId: text(form, "agencyId"), enabled: text(form, "enabled") === "true" }), "Destinataires mis à jour.");
}
function RoleSelect({ id, value }: { id: string; value?: HrScopedRole }) {
  return <div className="grid min-w-0 gap-2"><label htmlFor={id} className={labelClass}>Rôle</label>
    <select id={id} name="role" defaultValue={value ?? "team_manager"} className={fieldClass}>
      <option value="team_manager">{ROLE_LABEL.team_manager} — congés, affectations, remplacements</option>
      <option value="client_viewer">{ROLE_LABEL.client_viewer} — suivi opérationnel de sites</option>
    </select></div>;
}
/** Sites and departments grouped by agency; a scope must stay within one agency. */
function ScopePicker({ agencies, referential, selectedSites = [], selectedDepartments = [] }: {
  agencies: Agency[]; referential: HrReferential; selectedSites?: string[]; selectedDepartments?: string[];
}) {
  const visible = agencies.filter((agency) => referential.sites.some((s) => s.agency_id === agency.id) || referential.departments.some((d) => d.agency_id === agency.id));
  if (!visible.length) return <p className="text-sm text-muted-foreground">Créez d’abord des sites et départements dans Organisation.</p>;
  const option = (name: string, id: string, label: string, checked: boolean, active: boolean) => <label key={id} className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm">
    <input type="checkbox" name={name} value={id} defaultChecked={checked} disabled={!active && !checked} className="size-4 accent-[hsl(var(--primary))]" />
    <span className="min-w-0 [overflow-wrap:anywhere]">{label}{active ? "" : " (inactif)"}</span></label>;
  return <div className="grid gap-4">
    <p className="text-sm text-muted-foreground">Une seule agence par accès. Pour un manager, choisir des départements <em>et</em> des sites limite l’accès à leur intersection. Un client ne reçoit que des sites.</p>
    {visible.map((agency) => <fieldset key={agency.id} className="grid gap-3 rounded-2xl border border-border p-4">
      <legend className="px-1 font-display text-sm font-semibold">{agency.name}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid content-start gap-2"><p className={`${labelClass} flex items-center gap-2`}><MapPin className="size-4" aria-hidden="true" />Sites</p>
          {referential.sites.filter((s) => s.agency_id === agency.id).map((s) => option("siteIds", s.id, `${s.name} (${s.code})`, selectedSites.includes(s.id), s.is_active))}</div>
        <div className="grid content-start gap-2"><p className={`${labelClass} flex items-center gap-2`}><Layers className="size-4" aria-hidden="true" />Départements</p>
          {referential.departments.filter((d) => d.agency_id === agency.id).map((d) => option("departmentIds", d.id, d.name, selectedDepartments.includes(d.id), d.is_active))}</div>
      </div>
    </fieldset>)}
  </div>;
}
function describeScopes(profile: HrAccessProfile, referential: HrReferential, agencies: Agency[]) {
  const site = (id: string | null) => referential.sites.find((s) => s.id === id)?.name;
  const department = (id: string | null) => referential.departments.find((d) => d.id === id)?.name;
  const agency = agencies.find((a) => a.id === profile.hr_scopes[0]?.agency_id)?.name ?? "Agence";
  const parts = profile.hr_scopes.map((s) => [department(s.department_id), site(s.site_id)].filter(Boolean).join(" · "));
  return `${agency} — ${parts.join(", ") || "aucun périmètre"}`;
}
export default async function HrAccessPage() {
  let actor: Awaited<ReturnType<typeof requireCanAdministerHrAccess>>;
  try { actor = await requireCanAdministerHrAccess(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Accès RH" />;
    throw error;
  }
  const [agencies, referential, profiles, reports] = await Promise.all([listAgencies(), listHrReferential(), listHrAccessProfiles(), listReportSubscriptions()]);
  const subscribed = (profileId: string, kind: string, agencyId: string) => reports.subscriptions.some((s) => s.profile_id === profileId && s.kind === kind && s.agency_id === agencyId);
  const managers = profiles.filter((p) => p.role === "team_manager").length;
  return <AppShell role={actor.role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Administration" title="Accès RH" icon={KeyRound} description="Managers RH et accès clients, limités à des sites et départements. Les RH gèrent les dossiers ; seul le super administrateur attribue ces accès.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={UsersRound} label="Managers" value={managers} />
        <HeaderStat icon={Eye} label="Clients" value={profiles.length - managers} />
        <HeaderStat icon={ShieldCheck} label="Actifs" value={profiles.filter((p) => p.is_active).length} />
      </div>
    </PageHeader>
    <Callout icon={ShieldCheck} tone="teal">Un manager RH ne voit ni bulletins, ni documents personnels, ni contacts privés, ni demandes RH. Un client ne voit que les données opérationnelles de ses sites. La révocation s’applique immédiatement aux sessions ouvertes.</Callout>
    <Panel icon={UserPlus} tone="accent" title="Nouvel accès" titleId="new-access" description="La personne se connectera avec son adresse, par lien magique.">
      <AdminForm action={createAccess} label="Nouvel accès RH" resetOnSuccess className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-3"><Input id="new-access-email" label="Email" name="email" type="email" maxLength={254} required placeholder="nom@entreprise.com" /><Input id="new-access-name" label="Nom complet" name="fullName" maxLength={160} required /><RoleSelect id="new-access-role" /></div>
        <ScopePicker agencies={agencies} referential={referential} />
        <div><Button type="submit"><UserPlus className="size-4" aria-hidden="true" />Créer l’accès</Button></div>
      </AdminForm>
    </Panel>
    <section aria-labelledby="access-list" className="grid min-w-0 gap-4">
      <h2 id="access-list" className="font-display text-lg font-semibold">Accès enregistrés</h2>
      <ul className="stagger grid min-w-0 gap-4">{profiles.map((profile) => <li key={profile.id} className={`min-w-0 rounded-3xl border p-5 shadow-[var(--shadow-sm)] ${profile.is_active ? "border-border/80 bg-surface" : "border-dashed border-border bg-surface/70"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><Avatar name={profile.full_name} size="lg" /><div className="min-w-0 [overflow-wrap:anywhere]"><h3 className="font-display font-semibold">{profile.full_name}</h3><p className="text-sm text-muted-foreground">{profile.email} · {ROLE_LABEL[profile.role]}</p><p className="mt-1 text-sm">{describeScopes(profile, referential, agencies)}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={profile.is_active ? "ACTIVE" : "INACTIVE"} label={profile.is_active ? "Actif" : "Révoqué"} />
            <AdminForm action={toggleAccess} label={`${profile.is_active ? "Révoquer" : "Rétablir"} l’accès de ${profile.email}`}>
              <input type="hidden" name="id" value={profile.id} /><input type="hidden" name="updatedAt" value={profile.updated_at} /><input type="hidden" name="isActive" value={String(!profile.is_active)} />
              <Button type="submit" size="sm" variant={profile.is_active ? "danger" : "secondary"}>{profile.is_active ? "Révoquer" : "Rétablir"}</Button>
            </AdminForm></div>
        </div>
        <details className="mt-4 rounded-2xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Modifier le rôle et le périmètre</summary>
          <AdminForm action={updateAccess} label={`Modifier l’accès de ${profile.email}`} className="mt-4 grid gap-4">
            <input type="hidden" name="id" value={profile.id} /><input type="hidden" name="updatedAt" value={profile.updated_at} />
            <div className="grid gap-4 md:grid-cols-2"><Input id={`access-name-${profile.id}`} label="Nom complet" name="fullName" defaultValue={profile.full_name} maxLength={160} required /><RoleSelect id={`access-role-${profile.id}`} value={profile.role} /></div>
            <ScopePicker agencies={agencies} referential={referential} selectedSites={profile.hr_scopes.map((s) => s.site_id).filter((id): id is string => !!id)} selectedDepartments={profile.hr_scopes.map((s) => s.department_id).filter((id): id is string => !!id)} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input className={switchClass} type="checkbox" name="isActive" defaultChecked={profile.is_active} />Accès actif</label><Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button></div>
          </AdminForm>
        </details>
      </li>)}</ul>
      {!profiles.length ? <EmptyState icon={KeyRound} headingLevel={3} title="Aucun accès RH." description="Créez un manager RH ou un accès client ci-dessus." /> : null}
    </section>
    <Panel icon={BellRing} tone="amber" title="Alertes contrats et rapports mensuels" titleId="report-recipients" description="Alertes d’échéance (J-30, J-15, J-7) : RH uniquement, un récapitulatif quotidien. Rapport mensuel : RH, managers et clients, limité au périmètre de chacun. Envois automatiques par la tâche planifiée.">
      <ul className="grid gap-3">{reports.recipients.map((recipient) => <li key={recipient.id} className="grid gap-3 rounded-2xl border border-border p-4">
        <div className="min-w-0 [overflow-wrap:anywhere]"><p className="font-semibold">{recipient.full_name}</p><p className="text-sm text-muted-foreground">{recipient.email}</p></div>
        <div className="flex flex-wrap gap-2">{agencies.filter((a) => a.is_active).flatMap((agency) => (["CONTRACT_ALERTS", "MONTHLY_REPORT"] as const)
          .filter((kind) => kind === "MONTHLY_REPORT" || ["hr_central", "super_admin"].includes(recipient.role))
          .filter(() => ["hr_central", "super_admin"].includes(recipient.role) || profiles.find((p) => p.id === recipient.id)?.hr_scopes.some((scope) => scope.agency_id === agency.id))
          .map((kind) => {
            const on = subscribed(recipient.id, kind, agency.id);
            return <AdminForm key={`${agency.id}-${kind}`} action={toggleSubscription} label={`${on ? "Retirer" : "Ajouter"} ${recipient.email} ${kind === "CONTRACT_ALERTS" ? "alertes" : "rapport"} ${agency.name}`}>
              <input type="hidden" name="profileId" value={recipient.id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="agencyId" value={agency.id} /><input type="hidden" name="enabled" value={String(!on)} />
              <Button type="submit" size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on}>{kind === "CONTRACT_ALERTS" ? "Alertes" : "Rapport mensuel"} · {agency.name}</Button>
            </AdminForm>;
          }))}</div>
      </li>)}</ul>
    </Panel>
  </div></AppShell>;
}
