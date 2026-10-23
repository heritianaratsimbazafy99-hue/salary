"use server";
import { confirmUnlinkedEmailChange } from "@/lib/employees/identity-change";
export async function confirmEmailChange(_previous: { message: string; completed: boolean }, form: FormData) {
  try { await confirmUnlinkedEmailChange(String(form.get("requestId") ?? ""), String(form.get("token") ?? "")); return { message: "Nouvelle adresse vérifiée. Les RH peuvent maintenant vous adresser une invitation distincte pour activer votre accès.", completed: true }; }
  catch (error) { return { message: error instanceof Error ? error.message : "Vérification impossible.", completed: false }; }
}
