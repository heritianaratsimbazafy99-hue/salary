import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarCheck2, CalendarDays, Hourglass } from "lucide-react";
import { runDecision } from "@/components/hr/leave-actions";
import { LeaveDecisionForms, LeaveList } from "@/components/hr/LeaveList";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Surface";
import type { AdminFormResult } from "@/lib/admin/AdminForm";
import { getCurrentActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE, FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { listLeaves } from "@/lib/hr/leaves";
export const dynamic = "force-dynamic";
async function decide(form: FormData): Promise<AdminFormResult> {
  "use server";
  const result = await runDecision(form);
  revalidatePath("/team/leaves");
  return result;
}
export default async function TeamLeavesPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  let actor: Awaited<ReturnType<typeof getCurrentActor>>;
  try { actor = await getCurrentActor(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    if (error instanceof Error && error.message === FORBIDDEN_ERROR_MESSAGE) return <AccessDenied context="Espace équipe" />;
    throw error;
  }
  if (actor.role !== "team_manager") return <AccessDenied context="Espace équipe" />;
  const params = await searchParams ?? {};
  const showAll = params.status === "all";
  const [pending, all] = await Promise.all([listLeaves({ status: "PENDING" }), showAll ? listLeaves() : Promise.resolve(null)]);
  return <AppShell role="team_manager"><div className="flex flex-col gap-6 sm:gap-8">
    <PageHeader eyebrow="Espace équipe" title="Congés" icon={CalendarDays} description="Demandes des collaborateurs de votre périmètre. Les motifs personnels restent réservés au salarié et aux RH.">
      <div className="grid grid-cols-2 gap-2 sm:gap-3"><HeaderStat icon={Hourglass} label="À décider" value={pending.count} /><HeaderStat icon={CalendarCheck2} label="Vue" value={showAll ? "Toutes" : "En attente"} /></div>
    </PageHeader>
    <Callout icon={CalendarCheck2} tone="teal">L’approbation d’un congé payé débite le solde une seule fois, dans la même opération. Si le solde a changé entre-temps, la décision est refusée et la page doit être rechargée.</Callout>
    <div className="flex flex-wrap gap-2">
      <Link className={buttonClasses({ variant: showAll ? "secondary" : "primary", size: "sm" })} href="/team/leaves">En attente</Link>
      <Link className={buttonClasses({ variant: showAll ? "primary" : "secondary", size: "sm" })} href="/team/leaves?status=all">Toutes les demandes</Link>
    </div>
    <LeaveList entries={(all ?? pending).entries} emptyTitle={showAll ? "Aucune demande dans votre périmètre." : "Aucune demande en attente."} renderActions={(entry) => <LeaveDecisionForms entry={entry} action={decide} />} />
  </div></AppShell>;
}
