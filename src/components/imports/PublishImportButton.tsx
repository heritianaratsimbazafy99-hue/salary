"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

export function PublishImportButton({ importId }: { importId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function publishImport() {
    setIsPublishing(true);
    setMessage(null);
    setHasError(false);

    let shouldReactivate = true;

    try {
      const response = await fetch(`/api/imports/${importId}/publish`, {
        method: "POST",
      });

      if (response.ok) {
        shouldReactivate = false;
        window.location.reload();
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: unknown } }
        | null;
      setHasError(true);
      setMessage(typeof payload?.error?.message === "string" ? payload.error.message : "Publication impossible.");
    } catch {
      setHasError(true);
      setMessage("Erreur reseau. Verifiez votre connexion puis reessayez.");
    } finally {
      if (shouldReactivate) {
        setIsPublishing(false);
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={isPublishing} onClick={publishImport} type="button">
        {isPublishing ? "Publication" : "Publier"}
      </Button>
      {message ? (
        <p className={`text-sm ${hasError ? "text-danger" : "text-muted-foreground"}`} role={hasError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
