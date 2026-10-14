import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { cancelReplacement, confirmReplacement, saveAssignment } from "@/lib/hr/planning";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/** Shared server-action bodies; each page wraps them in its own "use server" action. */
export async function runSaveAssignment(form: FormData): Promise<AdminFormResult> {
  try {
    await saveAssignment({ assignmentId: text(form, "assignmentId"), employeeId: text(form, "employeeId"), siteId: text(form, "siteId"), teamId: text(form, "teamId"),
      startDate: text(form, "startDate"), endDate: text(form, "endDate"), status: text(form, "status"), revision: text(form, "revision") });
  } catch (error) { return { error: error instanceof Error ? error.message : "Enregistrement impossible." }; }
  return { success: "Affectation enregistrée." };
}

export async function runConfirmReplacement(form: FormData): Promise<AdminFormResult> {
  try { await confirmReplacement({ replacementId: text(form, "replacementId"), replacementEmployeeId: text(form, "replacementEmployeeId"), revision: text(form, "revision") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Confirmation impossible." }; }
  return { success: "Remplacement confirmé." };
}

export async function runCancelReplacement(form: FormData): Promise<AdminFormResult> {
  try { await cancelReplacement({ replacementId: text(form, "replacementId"), revision: text(form, "revision") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Annulation impossible." }; }
  return { success: "Besoin de remplacement annulé." };
}
