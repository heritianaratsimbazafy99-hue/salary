import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { assertCanManagePayrollForAgency } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ManualCorrectionSchema } from "@/lib/payroll/manager-review";
import { managerErrorResponse } from "@/lib/payroll/manager-route-errors";

export async function PATCH(request: Request, context: { params: Promise<{ importId: string; rowId: string }> }) {
  try {
    const actor = await getCurrentAgencyScopedActor();
    assertCanManagePayrollForAgency({ actorAgencyId: actor.agencyId, requestedAgencyId: actor.agencyId, role: actor.role });
    const { importId, rowId } = await context.params;
    const body = ManualCorrectionSchema.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(importId).success || !z.uuid().safeParse(rowId).success || !body.success) return NextResponse.json({ error: { message: "Correction invalide. Vérifiez les montants et le motif (5 caractères minimum)." } }, { status: 422 });
    const client = await createClient();
    const { data } = await client.from("payroll_import_rows").select("id").eq("id", rowId).eq("import_id", importId).eq("agency_id", actor.agencyId).single();
    if (!data) return NextResponse.json({ error: { message: "Ligne introuvable." } }, { status: 404 });
    const { error } = await createAdminClient().rpc("adjust_payroll_import_row", { p_import_id: importId, p_row_id: rowId, p_actor_profile_id: actor.id, p_actor_agency_id: actor.agencyId, p_expected_updated_at: body.data.expectedUpdatedAt, p_changes: body.data.changes, p_reason: body.data.reason });
    if (error) throw error;
    return NextResponse.json({ data: { saved: true } });
  } catch (error) { return managerErrorResponse(error); }
}
