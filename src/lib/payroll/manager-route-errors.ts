import { NextResponse } from "next/server";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";

export function managerErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const status = message === AUTH_REQUIRED_ERROR_MESSAGE ? 401 : message === FORBIDDEN_ERROR_MESSAGE || code === "42501" ? 403 : code === "P0002" ? 404 : (code === "40001" || code === "PT409") ? 409 : code === "22023" ? 422 : 500;
  return NextResponse.json({ error: { message: status === 409 ? "Les données ont changé ou sont déjà publiées. Rechargez la page." : status === 403 ? "Accès refusé." : status === 401 ? "Authentification requise." : status === 422 ? "Correction invalide." : status === 404 ? "Import introuvable." : "Impossible de traiter cette demande." } }, { status });
}
