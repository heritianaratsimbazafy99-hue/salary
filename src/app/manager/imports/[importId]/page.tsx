import { ImportReport } from "@/components/imports/ImportReport";
import { UploadStepper } from "@/components/imports/UploadStepper";

export default function ImportDetailPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Rapport d&apos;import</h1>
        <p className="text-sm text-muted-foreground">
          Controlez les lignes valides et les erreurs avant publication.
        </p>
      </div>
      <UploadStepper currentStep={2} />
      <ImportReport errors={[]} invalidRowCount={0} unknownEmployeeCount={0} validRowCount={0} />
    </main>
  );
}
