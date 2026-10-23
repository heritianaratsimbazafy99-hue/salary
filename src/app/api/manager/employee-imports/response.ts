import { getPublicSupabaseConfig } from "@/lib/env.public";
import { EmployeeImportInputError } from "@/lib/employees/import-schema";
import { NextResponse } from "next/server";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
export function employeeImportError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  const status = message === AUTH_REQUIRED_ERROR_MESSAGE ? 401 : message === FORBIDDEN_ERROR_MESSAGE || code === "42501" ? 403 : code === "P0002" ? 404 : code === "PT410" ? 410 : code === "PT409" || code === "23505" || code === "40001" ? 409 : code === "22023" || error instanceof EmployeeImportInputError ? 422 : 500;
  return NextResponse.json({ error: status === 409 ? "Les données ont changé. Revoir la sélection avant de confirmer. Aucune création partielle n’a été effectuée." : status === 410 ? "Ce rapport a expiré. Rechargez le fichier." : status === 403 ? "Accès refusé à cet import." : status === 401 ? "Votre session a expiré. Reconnectez-vous." : status === 404 ? "Import introuvable ou expiré." : status === 422 && error instanceof EmployeeImportInputError ? message : status === 422 ? "Des lignes restent invalides. Revoyez la sélection." : "Import indisponible. Réessayez sans recharger le fichier si le rapport existe déjà." }, { status });
}

/** Bound chunked bodies too: content-length is only an early hint. */
export async function readEmployeeImportBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new EmployeeImportInputError("La requête est vide.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new EmployeeImportInputError("Le fichier ou la sélection dépasse la limite autorisée."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function hasEmployeeImportOrigin(request: Request): boolean {
  // Next may reconstruct request.url with an internal host behind the proxy.
  // Only the configured public app origin authorizes browser mutations.
  return request.headers.get("origin") === new URL(getPublicSupabaseConfig().appUrl).origin;
}
