import { getPublicSupabaseConfig } from "@/lib/env.public";
import { z } from "zod";
import { getCurrentActor } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicationConfirmationSchema } from "@/lib/payroll/manager-review";
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(getPublicSupabaseConfig().appUrl).origin) return Response.json({ error: { message: "Origine de la requête refusée." } }, { status: 403 });
    const actor = await getCurrentActor();
    if (!["hr_central", "super_admin"].includes(actor.role)) return Response.json({ error: { message: "Accès refusé." } }, { status: 403 });
    const { importId } = await context.params;
    if (!z.uuid().safeParse(importId).success) return Response.json({ error: { message: "Import invalide." } }, { status: 422 });
    const input = PublicationConfirmationSchema.parse(await request.json());
    const { error } = await createAdminClient().rpc("approve_departed_payroll", { p_actor_id: actor.id, p_import_id: importId, p_fingerprint: input.fingerprint });
    if (error) return Response.json({ error: { message: "La revue a changé ou la validation est interdite. Rechargez." } }, { status: 409 });
    return Response.json({ data: { approved: true } });
  } catch { return Response.json({ error: { message: "Validation impossible." } }, { status: 422 }); }
}
