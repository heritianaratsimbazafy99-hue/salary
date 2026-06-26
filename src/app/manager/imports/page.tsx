import { UploadStepper } from "@/components/imports/UploadStepper";

export default function ManagerImportsPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Imports de paie</h1>
        <p className="text-sm text-muted-foreground">Chargez un fichier Excel pour une periode de paie.</p>
      </div>
      <UploadStepper currentStep={0} />
      <form className="grid gap-4 rounded border border-border p-4 md:grid-cols-2">
        <label className="text-sm">
          Debut de periode
          <input className="mt-1 w-full rounded border border-border px-3 py-2" name="periodStart" type="date" />
        </label>
        <label className="text-sm">
          Fin de periode
          <input className="mt-1 w-full rounded border border-border px-3 py-2" name="periodEnd" type="date" />
        </label>
        <label className="text-sm md:col-span-2">
          Fichier Excel
          <input
            accept=".xlsx,.xls"
            className="mt-1 w-full rounded border border-border px-3 py-2"
            name="file"
            type="file"
          />
        </label>
      </form>
    </main>
  );
}
