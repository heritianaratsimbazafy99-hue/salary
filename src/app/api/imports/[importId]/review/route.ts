import { NextResponse } from "next/server";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { PublicationReviewSchema } from "@/lib/payroll/manager-review";
import { managerErrorResponse } from "@/lib/payroll/manager-route-errors";
import { z } from "zod";

export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await getCurrentAgencyScopedActor();
    assertCanManagePayrollForAgency({ actorAgencyId: actor.agencyId, requestedAgencyId: actor.agencyId, role: actor.role });
    const { importId } = await context.params;
    if (!z.uuid().safeParse(importId).success) return NextResponse.json({ error: { message: "Import invalide." } }, { status: 422 });
    const client = await createClient();
    const { data: payrollImport } = await client.from("payroll_imports").select("id,status").eq("id", importId).eq("agency_id", actor.agencyId).single();
    if (!payrollImport) return NextResponse.json({ error: { message: "Import introuvable." } }, { status: 404 });
    if (payrollImport.status !== "READY_FOR_PREVIEW") return NextResponse.json({ error: { message: "Cet import ne peut pas être publié." } }, { status: 409 });
    const { data, error } = await client.rpc("review_payroll_import", { p_import_id: importId });
    if (error) throw error;
    return NextResponse.json({ data: PublicationReviewSchema.parse(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return managerErrorResponse(error); }
}
