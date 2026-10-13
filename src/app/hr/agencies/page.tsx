import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  return <AppShell role={role}><div className="flex flex-col gap-8">
    <PageHeader eyebrow="Administration RH" title="Agences" description="Créez, modifiez ou suspendez une agence en conservant ses données et son historique." />
    <section className="rounded-2xl border border-border bg-surface p-6" aria-labelledby="new-agency">
      <h2 id="new-agency" className="font-display font-semibold">Nouvelle agence</h2>
      <AdminForm action={save} label="Nouvelle agence" resetOnSuccess className="mt-4 grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
        <Input label="Nom de l'agence" name="name" maxLength={160} required /><Input label="Code" name="code" maxLength={32} required />
        <input type="hidden" name="isActive" value="on" /><Button type="submit">Créer</Button>
      </AdminForm>
    </section>
    <section className="grid min-w-0 grid-cols-1 gap-4" aria-labelledby="agencies-list">
      <h2 id="agencies-list" className="font-display font-semibold">Liste des agences</h2>
      <p className="text-sm text-muted-foreground">La désactivation bloque immédiatement les accès des responsables et des salariés de cette agence, y compris leurs sessions ouvertes. Les autres affectations actives des salariés restent accessibles. La réactivation rétablit ces accès.</p>
      {agencies.map((agency) => <article key={agency.id} className="min-w-0 rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-semibold">{agency.name}</h3><StatusBadge status={agency.is_active ? "ACTIVE" : "INACTIVE"} /></div>
        <AdminForm action={save} label={`Modifier l’agence ${agency.name}`} className="grid items-end gap-4 md:grid-cols-[1fr_10rem_auto_auto]">
          <input type="hidden" name="id" value={agency.id} />
          <Input id={`name-${agency.id}`} label="Nom de l'agence" name="name" defaultValue={agency.name} maxLength={160} required />
          <Input id={`code-${agency.id}`} label="Code" name="code" defaultValue={agency.code} maxLength={32} required />
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={agency.is_active} />Agence active</label>
          <Button type="submit" variant="secondary">Enregistrer</Button>
        </AdminForm>
      </article>)}
      {!agencies.length ? <p className="text-sm text-muted-foreground">Aucune agence enregistrée.</p> : null}
    </section>
  </div></AppShell>;
}
