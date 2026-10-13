import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { buildPayrollTemplate } from "@/lib/payroll/template";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    if (!["agency_manager", "hr_central", "super_admin"].includes(actor.role)) {
      return NextResponse.json({ error: { message: "Accès réservé aux responsables de paie." } }, { status: 403 });
    }
    return new NextResponse(await buildPayrollTemplate(), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="modele-paie-madajobpay.xlsx"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === AUTH_REQUIRED_ERROR_MESSAGE ? 401 : message === FORBIDDEN_ERROR_MESSAGE ? 403 : 500;
    return NextResponse.json({ error: { message: "Modèle indisponible. Vérifiez votre connexion et réessayez." } }, { status });
  }
}
