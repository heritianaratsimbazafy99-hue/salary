"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
export function EmployeeImportUpload() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  return <form className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" onSubmit={async (event) => {
    event.preventDefault(); if (pending) return; setPending(true); setError("");
    try {
      const response = await fetch("/api/manager/employee-imports", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Import indisponible.");
      router.push(`/manager/employees/imports/${result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connexion interrompue. Réessayez."); setPending(false); }
  }}>
    <label htmlFor="employee-import-file" className="font-medium">Fichier salariés XLSX</label>
    <input id="employee-import-file" name="file" type="file" accept=".xlsx" required disabled={pending} className="w-full min-w-0 max-w-full rounded-lg border border-border p-3" />
    <p className="text-sm text-muted-foreground">4 Mo et 1 000 lignes maximum. Matricules au format texte, zéros initiaux conservés. Remplacez les formules par des valeurs. Supprimez la ligne d’exemple du modèle.</p>
    <p className="text-sm text-muted-foreground">Création uniquement : aucun fichier source conservé, aucune paie ni invitation envoyée. Les rapports expirent après 30 jours.</p>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    <button type="submit" disabled={pending} className={buttonClasses({ className: "w-full min-w-0 scroll-mb-32 scroll-mt-20 whitespace-normal" })}>{pending ? "Analyse du fichier…" : "Prévisualiser le fichier"}</button>
  </form>;
}
