import { PayrollAnalytics } from "@/components/analytics/PayrollAnalytics";

export default function AnalyticsPage() {
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
