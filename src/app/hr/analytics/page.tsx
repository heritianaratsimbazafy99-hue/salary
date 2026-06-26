import { PayrollAnalytics } from "@/components/analytics/PayrollAnalytics";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import { recordAuditEvent } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const actor = await requireCanReadPayrollAnalytics();

  await recordAuditEvent({
    action: "ANALYTICS_VIEWED",
    actorProfileId: actor.id,
    actorRole: actor.role,
    resourceType: "payroll_analytics",
  });

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics paie</h1>
        <p className="text-sm text-muted-foreground">Analyse detaillee des donnees de paie publiees.</p>
      </div>
      <PayrollAnalytics rows={[]} />
    </main>
  );
}
