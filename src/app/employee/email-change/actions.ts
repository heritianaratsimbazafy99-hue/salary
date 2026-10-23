"use server";
import { finishOwnEmailChange, startOwnEmailChange } from "@/lib/employees/identity-change";
import { revalidatePath } from "next/cache";
export async function emailChangeAction(_previous: { message: string }, form: FormData) {
  try {
    const requestId = String(form.get("requestId") ?? "");
    if (form.get("mode") === "finish") { await finishOwnEmailChange(requestId); revalidatePath("/employee/email-change"); return { message: "Adresse vérifiée et changement réalisé." }; }
    await startOwnEmailChange(requestId);
    return { message: "Vérification demandée. Confirmez les liens reçus aux adresses concernées, puis finalisez ici. Votre adresse effective reste inchangée jusqu’à vérification." };
  } catch (error) { return { message: error instanceof Error ? error.message : "Vérification impossible." }; }
}
