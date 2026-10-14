import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { cancelLeave, decideLeave } from "@/lib/hr/leaves";

/** Shared server-action bodies; each page wraps them in its own "use server" action. */
export async function runDecision(form: FormData): Promise<AdminFormResult> {
  try {
    await decideLeave({ leaveId: String(form.get("leaveId") ?? ""), approve: form.get("approve") === "true", decisionReason: String(form.get("decisionReason") ?? ""), revision: String(form.get("revision") ?? ""), replacementNeeded: form.get("replacementNeeded") === "on" });
  } catch (error) { return { error: error instanceof Error ? error.message : "Décision impossible." }; }
  return { success: form.get("approve") === "true" ? (form.get("replacementNeeded") === "on" ? "Demande approuvée ; besoin de remplacement créé." : "Demande approuvée.") : "Demande refusée." };
}

export async function runCancellation(form: FormData): Promise<AdminFormResult> {
  try { await cancelLeave({ leaveId: String(form.get("leaveId") ?? ""), reason: String(form.get("reason") ?? ""), revision: String(form.get("revision") ?? "") }); }
  catch (error) { return { error: error instanceof Error ? error.message : "Annulation impossible." }; }
  return { success: "Demande annulée ; les jours éventuellement débités sont recrédités." };
}
