"use server";

import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { runMonitoringSmoke } from "@/lib/monitoring/smoke";

export async function sendMonitoringSmoke(): Promise<AdminFormResult> {
  try {
    const result = await runMonitoringSmoke();
    return result.flushed
      ? { success: `Test envoyé à Sentry. Identifiant : ${result.eventId}. Vérifiez sa réception et l'alerte par e-mail.` }
      : { error: `La transmission n'a pas été confirmée. Identifiant : ${result.eventId}. Vérifiez Sentry avant de réessayer.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const knownMessages = [
      AUTH_REQUIRED_ERROR_MESSAGE,
      FORBIDDEN_ERROR_MESSAGE,
      "La supervision Sentry n'est pas configurée.",
      "Impossible de vérifier le dernier test de supervision.",
      "Un test a déjà été lancé. Patientez quinze minutes avant de réessayer.",
    ];
    return { error: knownMessages.includes(message) ? message : "Le test de supervision n'a pas pu être confirmé. Consultez Sentry avant de réessayer." };
  }
}
