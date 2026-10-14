import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import type { DirectoryEntry } from "@/lib/hr/employees";
import { CONTRACT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, HR_CONTRACT_TYPES, HR_EMPLOYEE_STATUSES } from "@/lib/hr/labels";
import type { HrReferential } from "@/lib/hr/referential";

function Select({ id, label, name, value, required, children }: { id: string; label: string; name: string; value?: string | null; required?: boolean; children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-2"><label htmlFor={id} className={labelClass}>{label}</label>
    <select id={id} name={name} defaultValue={value ?? ""} required={required} className={fieldClass}>{children}</select></div>;
}

/**
 * Job, organisation and contract fields shared by creation and edition. Only
 * active referential items are offered, plus the current value if it was
 * deactivated since (the server re-validates every reference).
 */
export function EmployeeRecordFields({ prefix, referential, managers, entry }: {
  prefix: string; referential: HrReferential; managers: Array<{ id: string; full_name: string }>; entry?: DirectoryEntry;
}) {
  const keep = <T extends { id: string; is_active: boolean }>(items: T[], current?: string | null) => items.filter((item) => item.is_active || item.id === current);
  const siteName = (siteId: string) => referential.sites.find((site) => site.id === siteId)?.name ?? "";
  return <>
    <Input id={`${prefix}-job`} label="Poste" name="jobTitle" defaultValue={entry?.job_title ?? ""} maxLength={160} required placeholder="Ex. : Conseiller client" />
    <Select id={`${prefix}-department`} label="Département" name="departmentId" value={entry?.department_id} required>
      <option value="">Sélectionner</option>{keep(referential.departments, entry?.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </Select>
    <Select id={`${prefix}-site`} label="Site" name="siteId" value={entry?.site_id} required>
      <option value="">Sélectionner</option>{keep(referential.sites, entry?.site_id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
    </Select>
    <Select id={`${prefix}-team`} label="Équipe (facultatif)" name="teamId" value={entry?.team_id}>
      <option value="">Aucune</option>{keep(referential.teams, entry?.team_id).map((t) => <option key={t.id} value={t.id}>{t.name} — {siteName(t.site_id)}</option>)}
    </Select>
    <Select id={`${prefix}-manager`} label="Responsable (facultatif)" name="managerProfileId" value={entry?.manager_profile_id}>
      <option value="">Aucun</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      {entry?.manager_profile_id && !managers.some((m) => m.id === entry.manager_profile_id) ? <option value={entry.manager_profile_id}>{entry.manager_name ?? "Responsable actuel"}</option> : null}
    </Select>
    <Select id={`${prefix}-status`} label="Statut" name="status" value={entry?.status ?? "ACTIVE"} required>
      {HR_EMPLOYEE_STATUSES.map((status) => <option key={status} value={status}>{EMPLOYEE_STATUS_LABEL[status]}</option>)}
    </Select>
    <Select id={`${prefix}-contract`} label="Type de contrat" name="contractType" value={entry?.contract_type ?? "CDI"} required>
      {HR_CONTRACT_TYPES.map((type) => <option key={type} value={type}>{CONTRACT_TYPE_LABEL[type]}</option>)}
    </Select>
    <Input id={`${prefix}-start`} label="Début du contrat" name="contractStart" type="date" defaultValue={entry?.contract_start ?? ""} required />
    <Input id={`${prefix}-end`} label="Fin du contrat" name="contractEnd" type="date" defaultValue={entry?.contract_end ?? ""} hint="Obligatoire pour un CDD ; facultative pour une mission ou un intérim à terme imprécis." />
  </>;
}

export function recordInput(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  return {
    jobTitle: text("jobTitle"), departmentId: text("departmentId"), siteId: text("siteId"), teamId: text("teamId"),
    managerProfileId: text("managerProfileId"), status: text("status"), contractType: text("contractType"),
    contractStart: text("contractStart"), contractEnd: text("contractEnd"),
  } as const;
}
