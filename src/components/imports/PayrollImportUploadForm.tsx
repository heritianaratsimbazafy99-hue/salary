"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { CalendarRange, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const MAX_BYTES = 4 * 1024 * 1024;

export function PayrollImportUploadForm({ agencyId }: { agencyId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setMessage(null);
    setHasError(false);

    const form = event.currentTarget;
    let shouldReactivate = true;

    try {
      const formData = new FormData(form);
      const file = formData.get("file");
      if (file instanceof File && file.size > MAX_BYTES) {
        setHasError(true); setMessage("Le fichier dépasse la limite de 4 Mo."); return;
      }
      const response = await fetch("/api/imports", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { importId?: unknown }; error?: { message?: unknown } }
        | null;

      if (!response.ok) {
        setHasError(true);
        setMessage(typeof payload?.error?.message === "string" ? payload.error.message : "Import impossible.");
        return;
      }

      const importId = payload?.data?.importId;
      if (typeof importId === "string") {
        shouldReactivate = false;
        window.location.assign(`/manager/imports/${importId}`);
        return;
      }

      setMessage("Import cree, rechargez la page pour le consulter.");
    } catch {
      setHasError(true);
      setMessage("Erreur reseau. Verifiez votre connexion puis reessayez.");
    } finally {
      if (shouldReactivate) {
        setIsUploading(false);
      }
    }
  }

  function fillPeriod(monthOffset: number) {
    const form = formRef.current;
    if (!form) return;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    (form.elements.namedItem("periodStart") as HTMLInputElement).value = start.toISOString().slice(0, 10);
    (form.elements.namedItem("periodEnd") as HTMLInputElement).value = end.toISOString().slice(0, 10);
  }

  function syncFile() {
    const selected = fileRef.current?.files?.[0];
    setFile(selected ? { name: selected.name, size: selected.size } : null);
    setHasError(false);
    setMessage(selected && selected.size > MAX_BYTES ? "Le fichier dépasse la limite de 4 Mo." : null);
    if (selected && selected.size > MAX_BYTES) setHasError(true);
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    syncFile();
  }

  const dragProps = {
    onDragEnter: (event: DragEvent) => { event.preventDefault(); setIsDragging(true); },
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDragLeave: () => setIsDragging(false),
    onDrop: () => setIsDragging(false),
  };

  return (
    <form
      ref={formRef}
      action="/api/imports"
      className="grid gap-5"
      encType="multipart/form-data"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="agencyId" type="hidden" value={agencyId} />

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Debut de periode" name="periodStart" required type="date" />
        <Input label="Fin de periode" name="periodEnd" required type="date" />
      </div>
      <div className="-mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
          <CalendarRange className="size-3.5" aria-hidden="true" />
          Raccourcis :
        </span>
        <button
          className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/[0.05]"
          onClick={() => fillPeriod(-1)}
          type="button"
        >
          Mois précédent
        </button>
        <button
          className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/[0.05]"
          onClick={() => fillPeriod(0)}
          type="button"
        >
          Mois en cours
        </button>
      </div>

      <div
        className={`relative flex min-h-44 flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200 ${
          isDragging
            ? "scale-[1.01] border-primary bg-primary/[0.06]"
            : file
              ? "border-success/40 bg-success/[0.05]"
              : "border-border bg-surface-elevated hover:border-primary/40 hover:bg-primary/[0.03]"
        }`}
        {...dragProps}
      >
        <input
          accept=".xlsx,.xls"
          aria-describedby="import-file-hint"
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          id="file"
          name="file"
          onChange={syncFile}
          ref={fileRef}
          required
          type="file"
        />
        {file ? (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-success/12 text-success">
              <FileSpreadsheet className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-3 flex max-w-full items-center gap-1.5 break-all font-semibold text-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              {file.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} Ko · prêt à importer</p>
            <button
              className="relative z-20 mt-3 inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={clearFile}
              type="button"
            >
              <X className="size-3.5" aria-hidden="true" />
              Changer de fichier
            </button>
          </>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="size-7" aria-hidden="true" />
            </span>
            <label className="mt-3 font-semibold text-foreground" htmlFor="file">
              Fichier Excel (4 Mo maximum)
            </label>
            <p className="mt-1 text-sm text-muted-foreground" id="import-file-hint">
              Glissez-déposez votre fichier .xlsx ou .xls ici, ou touchez pour le choisir.
            </p>
          </>
        )}
        {file ? (
          <label className="sr-only" htmlFor="file">
            Fichier Excel (4 Mo maximum)
          </label>
        ) : null}
      </div>

      <div className="grid gap-2 text-xs leading-5 text-muted-foreground">
        <p>
          Formats reconnus : modèle standard (feuille « payroll »), Airtel (feuille « Recap global »)
          et Huawei (feuille mensuelle). Sélectionnez la période correspondant à la paie du fichier.
        </p>
        <p>
          Si l’email est absent, il est repris du dossier salarié de votre agence grâce au matricule.
          Pour un salarié inconnu, créez d’abord son dossier RH ou ajoutez une colonne « email » au fichier.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          Les montants validés sont repris en ariary. Vérifiez le rapport et les destinataires avant de publier les fiches dans les espaces salariés.
        </p>
        <Button disabled={isUploading} size="lg" type="submit">
          {isUploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="size-4" aria-hidden="true" />}
          {isUploading ? "Import en cours" : "Importer"}
        </Button>
      </div>
      {message ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${hasError ? "bg-danger/[0.06] text-danger" : "bg-muted text-muted-foreground"}`}
          role={hasError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
