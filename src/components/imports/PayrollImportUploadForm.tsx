"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function PayrollImportUploadForm({ agencyId }: { agencyId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setMessage(null);
    setHasError(false);

    const form = event.currentTarget;
    let shouldReactivate = true;

    try {
      const response = await fetch("/api/imports", {
        body: new FormData(form),
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

  return (
    <form
      action="/api/imports"
      className="grid gap-4 border-t border-border pt-6 md:grid-cols-2"
      encType="multipart/form-data"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="agencyId" type="hidden" value={agencyId} />
      <Input label="Debut de periode" name="periodStart" required type="date" />
      <Input label="Fin de periode" name="periodEnd" required type="date" />
      <Input
        accept=".xlsx"
        className="pt-2"
        label="Fichier Excel"
        name="file"
        required
        type="file"
      />
      <div className="flex items-end">
        <Button disabled={isUploading} type="submit">
          {isUploading ? "Import en cours" : "Importer"}
        </Button>
      </div>
      {message ? (
        <p
          className={`text-sm md:col-span-2 ${hasError ? "text-danger" : "text-muted-foreground"}`}
          role={hasError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
