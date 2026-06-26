"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

export function PublishImportButton({ importId }: { importId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  async function publishImport() {
    setIsPublishing(true);
    setMessage(null);

    const response = await fetch(`/api/imports/${importId}/publish`, {
      method: "POST",
    });

    if (response.ok) {
      window.location.reload();
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: unknown } }
      | null;
    setMessage(typeof payload?.error?.message === "string" ? payload.error.message : "Publication impossible.");
    setIsPublishing(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={isPublishing} onClick={publishImport} type="button">
        {isPublishing ? "Publication" : "Publier"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
