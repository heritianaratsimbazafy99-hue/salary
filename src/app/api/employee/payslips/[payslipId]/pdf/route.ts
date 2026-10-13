import { NextResponse } from "next/server";

import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { apiError } from "@/lib/errors";
import { loadEmployeePayslips } from "@/lib/payslips/employee";
import { PdfExportError, renderEmployeePayslipPdf } from "@/lib/payslips/pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ payslipId: string }> },
) {
  try {
    const supabase = await createClient();
    const { payslipId } = await params;
    const payslips = await loadEmployeePayslips(supabase);
    const payslip = payslips.find((candidate) => candidate.id === payslipId);

    // Unknown, unpublished and another employee's IDs have the same response.
    if (!payslip) {
      return NextResponse.json(apiError("NOT_FOUND", "Fiche introuvable."), { status: 404 });
    }

    const pdf = await renderEmployeePayslipPdf(payslip);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="fiche-paie-${payslip.periodStart}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PdfExportError) {
      return NextResponse.json(apiError("VALIDATION_ERROR", error.message), { status: 400 });
    }
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) {
      return NextResponse.json(apiError("UNAUTHORIZED", "Connexion requise."), { status: 401 });
    }
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) {
      return NextResponse.json(apiError("FORBIDDEN", "Accès refusé."), { status: 403 });
    }
    return NextResponse.json(apiError("INTERNAL_ERROR", "Impossible de générer la fiche PDF."), { status: 500 });
  }
}
