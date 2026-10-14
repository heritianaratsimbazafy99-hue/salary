import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, PauseCircle, Plus, Save } from "lucide-react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, switchClass } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Callout, EmptyState, Panel } from "@/components/ui/Surface";
import { AdminForm, type AdminFormResult } from "@/lib/admin/AdminForm";
import { requireCanManageAgencies } from "@/lib/admin/auth";
import { saveAgency, listAgencies } from "@/lib/admin/agencies";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
export const dynamic = "force-dynamic";
async function save(form: FormData): Promise<AdminFormResult> {
  "use server";
  try {
    await saveAgency({ id: String(form.get("id") || "") || undefined, name: String(form.get("name") || ""), code: String(form.get("code") || ""), isActive: form.get("isActive") === "on" });
  } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  revalidatePath("/hr/agencies"); revalidatePath("/hr/users");
  return { success: "Agence enregistrée." };
}
export default async function AgenciesPage() {
  let role: Awaited<ReturnType<typeof requireCanManageAgencies>>;
  try { role = await requireCanManageAgencies(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Administration RH" />;
    throw error;
  }
  const agencies = await listAgencies();
  const active = agencies.filter((agency) => agency.is_active).length;
  return <AppShell role={role}><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Administration RH" title="Agences" icon={Building2} description="Créez, modifiez ou suspendez une agence en conservant ses données et son historique.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <HeaderStat icon={Building2} label="Agences" value={agencies.length} />
        <HeaderStat icon={CheckCircle2} label="Actives" value={active} />
        <HeaderStat icon={PauseCircle} label="Suspendues" value={agencies.length - active} />
      </div>
    </PageHeader>
    <Panel icon={Plus} tone="accent" title="Nouvelle agence" titleId="new-agency" description="Le code court identifie l'agence dans les fichiers et exports.">
      <AdminForm action={save} label="Nouvelle agence" resetOnSuccess className="grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
        <Input label="Nom de l'agence" name="name" maxLength={160} required placeholder="Ex. : Airtel Antananarivo" /><Input label="Code" name="code" maxLength={32} required placeholder="AIR-TNR" />
        <input type="hidden" name="isActive" value="on" /><Button type="submit"><Plus className="size-4" aria-hidden="true" />Créer</Button>
      </AdminForm>
    </Panel>
    <section className="grid min-w-0 grid-cols-1 gap-4" aria-labelledby="agencies-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="agencies-list" className="font-display text-lg font-semibold">Liste des agences</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{agencies.length} agence(s)</span>
      </div>
      <Callout icon={PauseCircle} tone="amber">La désactivation bloque immédiatement les accès des responsables et des salariés de cette agence, y compris leurs sessions ouvertes. Les autres affectations actives des salariés restent accessibles. La réactivation rétablit ces accès.</Callout>
      <div className="stagger grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {agencies.map((agency) => <article key={agency.id} className={`min-w-0 rounded-3xl border bg-surface p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] ${agency.is_active ? "border-border/80" : "border-dashed border-border bg-surface/70"}`}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold ${agency.is_active ? "brand-gradient text-primary-foreground shadow-[var(--shadow-sm)]" : "bg-muted text-muted-foreground"}`} aria-hidden="true">{agency.code.slice(0, 3).toUpperCase()}</span>
              <div className="min-w-0 [overflow-wrap:anywhere]"><h3 className="font-display font-semibold">{agency.name}</h3><p className="font-mono text-xs text-muted-foreground">{agency.code}</p></div>
            </div>
            <StatusBadge status={agency.is_active ? "ACTIVE" : "INACTIVE"} />
          </div>
          <AdminForm action={save} label={`Modifier l’agence ${agency.name}`} className="grid items-end gap-4 sm:grid-cols-[1fr_10rem]">
            <input type="hidden" name="id" value={agency.id} />
            <Input id={`name-${agency.id}`} label="Nom de l'agence" name="name" defaultValue={agency.name} maxLength={160} required />
            <Input id={`code-${agency.id}`} label="Code" name="code" defaultValue={agency.code} maxLength={32} required />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 sm:col-span-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input className={switchClass} type="checkbox" name="isActive" defaultChecked={agency.is_active} />Agence active</label>
              <Button type="submit" variant="secondary"><Save className="size-4" aria-hidden="true" />Enregistrer</Button>
            </div>
          </AdminForm>
        </article>)}
      </div>
      {!agencies.length ? <EmptyState icon={Building2} headingLevel={3} title="Aucune agence enregistrée." description="Créez une première agence pour pouvoir y rattacher des responsables et des salariés." /> : null}
    </section>
  </div></AppShell>;
}
