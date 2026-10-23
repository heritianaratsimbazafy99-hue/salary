import { getPublicSupabaseConfig } from "@/lib/env.public";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import { requestAgencyInvitations } from "@/lib/employees/agency-invitations";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(getPublicSupabaseConfig().appUrl).origin) return Response.json({ error: { message: "Origine de la requête refusée." } }, { status: 403 });
    const actor = await getCurrentAgencyScopedActor();
    return Response.json({ data: await requestAgencyInvitations(actor, await request.json()) });
  } catch { return Response.json({ error: { message: "Envoi impossible. Vérifiez vos droits, la sélection et le délai de renvoi." } }, { status: 409 }); }
}
