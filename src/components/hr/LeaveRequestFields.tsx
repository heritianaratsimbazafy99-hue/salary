import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { HR_LEAVE_TYPES, LEAVE_TYPE_LABEL } from "@/lib/hr/labels";

/** Type, period and reason of a leave request (days are computed by the server, Monday–Friday). */
export function LeaveRequestFields({ prefix }: { prefix: string }) {
  return <>
    <div className="grid min-w-0 gap-2"><label htmlFor={`${prefix}-type`} className={labelClass}>Type</label>
      <select id={`${prefix}-type`} name="leaveType" defaultValue="PAID_LEAVE" className={fieldClass}>{HR_LEAVE_TYPES.map((type) => <option key={type} value={type}>{LEAVE_TYPE_LABEL[type]}</option>)}</select></div>
    <Input id={`${prefix}-start`} label="Premier jour" name="startDate" type="date" required />
    <Input id={`${prefix}-end`} label="Dernier jour" name="endDate" type="date" required hint="Les jours ouvrés (lundi au vendredi) sont décomptés ; les jours fériés ne le sont pas automatiquement." />
    <Input id={`${prefix}-reason`} label="Motif" name="reason" maxLength={2000} required placeholder="Ex. : congé annuel" hint="Visible par vous et les RH uniquement." />
  </>;
}

export function leaveInput(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  return { employeeId: text("employeeId"), leaveType: text("leaveType"), startDate: text("startDate"), endDate: text("endDate"), reason: text("reason") };
}
