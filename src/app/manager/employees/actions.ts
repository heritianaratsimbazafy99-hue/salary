"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { createAgencyEmployee, departAgencyEmployee, requestAgencyEmployeeChange, saveAgencyEmployee } from "@/lib/employees/agency-management";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const versions = (form: FormData) => ({ employeeId: text(form, "employeeId"), identityRevision: Number(text(form, "identityRevision")), lifecycleRevision: Number(text(form, "lifecycleRevision")) });
const failure = (error: unknown): AdminFormResult => ({ error: error instanceof Error ? error.message : "Action impossible." });
function refresh(employeeId: string) { revalidatePath("/manager/employees"); revalidatePath(`/manager/employees/${employeeId}`); revalidatePath("/hr/agency-requests"); }
export async function createEmployeeAction(form: FormData): Promise<AdminFormResult> {
  let employeeId: string;
  try { employeeId = await createAgencyEmployee({ matricule: text(form, "matricule"), fullName: text(form, "fullName"), email: text(form, "email") }); } catch (error) { return failure(error); }
  refresh(employeeId); redirect(`/manager/employees/${employeeId}`);
}
export async function saveEmployeeAction(form: FormData): Promise<AdminFormResult> {
  try { await saveAgencyEmployee({ employeeId: text(form, "employeeId"), identityRevision: Number(text(form, "identityRevision")), operationalRevision: Number(text(form, "operationalRevision")), fullName: text(form, "fullName"), jobTitle: text(form, "jobTitle"), departmentId: text(form, "departmentId"), siteId: text(form, "siteId"), teamId: text(form, "teamId"), reason: text(form, "reason") }); } catch (error) { return failure(error); }
  refresh(text(form, "employeeId")); redirect(`/manager/employees/${text(form, "employeeId")}?saved=1`);
}
export async function departEmployeeAction(form: FormData): Promise<AdminFormResult> {
  if (form.get("confirm") !== "yes") return { error: "Confirmez le départ avant de continuer." };
  try { await departAgencyEmployee({ ...versions(form), departedOn: text(form, "departedOn"), reason: text(form, "reason") }); } catch (error) { return failure(error); }
  refresh(text(form, "employeeId")); redirect(`/manager/employees/${text(form, "employeeId")}?departed=1`);
}
export async function requestEmployeeChangeAction(form: FormData): Promise<AdminFormResult> {
  try { await requestAgencyEmployeeChange({ ...versions(form), type: text(form, "type"), value: text(form, "value"), reason: text(form, "reason") }); } catch (error) { return failure(error); }
  refresh(text(form, "employeeId")); return { success: "Demande transmise aux RH. La valeur actuelle reste effective jusqu’à sa réalisation." };
}
