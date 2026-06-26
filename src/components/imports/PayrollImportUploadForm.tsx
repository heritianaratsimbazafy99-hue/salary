"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function PayrollImportUploadForm({ agencyId }: { agencyId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setMessage(null);

    const form = event.currentTarget;
    const response = await fetch("/api/imports", {
      body: new FormData(form),
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: { importId?: unknown }; error?: { message?: unknown } }
      | null;

    if (!response.ok) {
      setMessage(typeof payload?.error?.message === "string" ? payload.error.message : "Import impossible.");
      setIsUploading(false);
      return;
    }

    const importId = payload?.data?.importId;
    if (typeof importId === "string") {
      window.location.assign(`/manager/imports/${importId}`);
      return;
    }

    setMessage("Import cree, rechargez la page pour le consulter.");
    setIsUploading(false);
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
        accept=".xlsx,.xls"
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
      {message ? <p className="text-sm text-muted-foreground md:col-span-2">{message}</p> : null}
    </form>
  );
}
