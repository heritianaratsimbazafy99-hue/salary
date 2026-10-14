"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, fieldClass, labelClass } from "@/components/ui/Input";
import { HR_DOCUMENT_MAX_BYTES, HR_DOCUMENT_MIME_TYPES } from "@/lib/hr/file-signature";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const CATEGORY_OPTIONS = [
  { value: "CONTRACT", label: "Contrat" },
  { value: "ADMINISTRATIVE", label: "Pièce administrative" },
  { value: "HISTORICAL_PAYSLIP", label: "Bulletin antérieur à la plateforme" },
] as const;

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  return typeof payload?.error?.message === "string" ? payload.error.message : fallback;
}

/**
 * Three steps, so that no file crosses a size-limited serverless function:
 * 1. the server registers a pending document and signs a single-use upload,
 * 2. the browser sends the file straight to the private bucket,
 * 3. the server checks the stored bytes and only then makes it available.
 */
export function DocumentUploadForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [category, setCategory] = useState<string>("CONTRACT");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return setMessage({ tone: "error", text: "Choisissez un fichier." });
    if (file.size > HR_DOCUMENT_MAX_BYTES) return setMessage({ tone: "error", text: "Le fichier dépasse 10 Mo." });
    if (!(HR_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return setMessage({ tone: "error", text: "Formats acceptés : PDF, PNG ou JPEG." });
    setPending(true);
    setMessage(null);
    try {
      const begin = await fetch("/api/hr/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId, category, title: String(form.get("title") ?? ""), documentDate: String(form.get("documentDate") ?? ""),
          period: category === "HISTORICAL_PAYSLIP" ? String(form.get("period") ?? "") : null, mimeType: file.type, sizeBytes: file.size,
        }),
      });
      if (!begin.ok) return setMessage({ tone: "error", text: await readError(begin, "Dépôt impossible.") });
      const { data } = (await begin.json()) as { data: { documentId: string; path: string; token: string } };
      const { error } = await createBrowserSupabaseClient().storage.from("hr-documents").uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
      if (error) return setMessage({ tone: "error", text: "L’envoi du fichier a échoué. Vérifiez votre connexion puis recommencez." });
      const complete = await fetch(`/api/hr/documents/${data.documentId}/complete`, { method: "POST" });
      if (!complete.ok) return setMessage({ tone: "error", text: await readError(complete, "Le document n’a pas pu être vérifié.") });
      formRef.current?.reset();
      setCategory("CONTRACT");
      setMessage({ tone: "success", text: "Document déposé. Il est visible du salarié dans son dossier." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Erreur réseau. Vérifiez votre connexion puis recommencez." });
    } finally {
      setPending(false);
    }
  }

  return <form ref={formRef} aria-label="Déposer un document" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <div className="grid min-w-0 gap-2"><label htmlFor="document-category" className={labelClass}>Type de document</label>
      <select id="document-category" name="category" value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
        {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></div>
    <Input id="document-title" label="Titre" name="title" maxLength={200} required placeholder="Ex. : Contrat de mission Airtel" />
    <Input id="document-date" label="Date du document" name="documentDate" type="date" required />
    {category === "HISTORICAL_PAYSLIP" ? <Input id="document-period" label="Mois de paie" name="period" type="month" required hint="Pour un bulletin produit avant la plateforme. Les bulletins publiés ici n’ont pas besoin d’être déposés." /> : null}
    <div className="grid min-w-0 gap-2 sm:col-span-2"><label htmlFor="document-file" className={labelClass}>Fichier (PDF, PNG ou JPEG, 10 Mo maximum)</label>
      <input id="document-file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-semibold`} /></div>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="size-4" aria-hidden="true" />}{pending ? "Dépôt en cours…" : "Déposer"}</Button>
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-success"}`}>{message.text}</p> : null}
    </div>
  </form>;
}
