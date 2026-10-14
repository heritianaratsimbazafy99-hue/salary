import { NextResponse } from "next/server";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { apiError } from "../errors";
import { HrDocumentError } from "./documents";

const NO_STORE = { "cache-control": "private, no-store" };

/** Maps HR route failures to stable JSON errors without exposing internals. */
export function hrRouteError(error: unknown): NextResponse {
  if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Connexion requise."), { status: 401, headers: NO_STORE });
  }
  if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) {
    return NextResponse.json(apiError("FORBIDDEN", "Accès refusé."), { status: 403, headers: NO_STORE });
  }
  if (error instanceof HrDocumentError) {
    const code = error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : error.status === 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
    return NextResponse.json(apiError(code, error.message), { status: error.status, headers: NO_STORE });
  }
  return NextResponse.json(apiError("INTERNAL_ERROR", "Opération impossible."), { status: 500, headers: NO_STORE });
}

export const hrNoStoreHeaders = NO_STORE;
