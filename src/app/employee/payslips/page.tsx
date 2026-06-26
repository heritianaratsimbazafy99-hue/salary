import { PayslipView } from "@/components/payslips/PayslipView";

export default function EmployeePayslipsPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Mes fiches de paie</h1>
        <p className="text-sm text-muted-foreground">Consultez vos fiches internes publiees.</p>
      </div>
      <PayslipView
        deductionsTotal={0}
        employeeName="Aucun salarie selectionne"
        grossAmount={0}
        netAmount={0}
        payItems={[]}
        periodLabel="Aucune periode publiee"
      />
    </main>
  );
}
