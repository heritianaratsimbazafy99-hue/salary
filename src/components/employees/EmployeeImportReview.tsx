"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeImportReport } from "@/lib/employees/import-schema";
import { buttonClasses } from "@/components/ui/Button";
const labels = { CREATE: "À créer", IDENTICAL: "Identique — ignoré", CONFLICT: "Conflit", DUPLICATE: "Doublon", ARCHIVED: "Archivé", DISABLED: "Accès désactivé", INVALID: "Invalide", EXCLUDED: "Exclu" };
export function EmployeeImportReview({ report }: { report: EmployeeImportReport }) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<number[]>(() => report.rows.filter(row => row.classification === "EXCLUDED").map(row => row.row_number));
  const [dirty, setDirty] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false);
  const committed = report.status === "COMMITTED";
  async function submit(intent: "review" | "commit") {
    if (pending) return; setPending(true); setError("");
    try {
      const response = await fetch(`/api/manager/employee-imports/${report.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent, fingerprint: report.fingerprint, ...(intent === "review" ? { excluded } : {}) }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setStale(true); throw new Error(result.error || "Action indisponible."); }
      setConfirmed(false); setDirty(false); setStale(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connexion interrompue. Le rapport permet de reprendre sans création en double."); }
    finally { setPending(false); }
  }
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
    {committed ? <p role="status" className="rounded-xl border border-border p-4">Import confirmé : {report.created_count} salarié(s) créé(s). Les salariés identiques ont été ignorés. Aucun email envoyé. Les invitations se demandent explicitement depuis l’annuaire.</p> : <p>Vérifiez chaque ligne. Les salariés identiques sont ignorés. Excluez les lignes en conflit ou corrigez leur dossier, puis revoyez la sélection. Aucune création n’a lieu avant confirmation.</p>}
    <p className="text-sm text-muted-foreground">Rapport accessible aux responsables de votre agence jusqu’au {new Date(report.expires_at).toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" })}.</p>
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-border" role="region" aria-label="Tableau de prévisualisation salariés" tabIndex={0}><table className="w-full min-w-[42rem] text-left text-sm"><caption className="sr-only">Prévisualisation des salariés à importer</caption><thead><tr>{["Sélection", "Ligne", "Matricule", "Nom complet", "Email", "Résultat"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>
      {report.rows.map(row => <tr key={row.row_number} className="border-t border-border align-top">
        <td className="p-3">{committed ? "—" : <input type="checkbox" aria-label={`Exclure la ligne ${row.row_number}`} checked={excluded.includes(row.row_number)} disabled={pending} onChange={event => { setExcluded(previous => event.target.checked ? [...previous, row.row_number] : previous.filter(number => number !== row.row_number)); setDirty(true); setConfirmed(false); }} />}</td>
        <td className="p-3">{row.row_number}</td><td className="break-all p-3">{row.matricule}</td><td className="p-3">{row.nom_complet}</td><td className="break-all p-3">{row.email}</td><td className="p-3"><span className="font-medium">{labels[row.classification]}</span>{row.issues.map((issue,index) => <p key={index} className="mt-1 text-destructive">{issue}</p>)}{row.classification === "CONFLICT" ? <p>Matricule ou email déjà utilisé avec des informations différentes. Aucun rapprochement par nom ou email.</p> : row.classification === "ARCHIVED" || row.classification === "DISABLED" ? <p>Demandez aux RH le retour ou la réactivation de ce dossier.</p> : null}</td>
      </tr>)}
    </tbody></table></div>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {stale ? <button type="button" disabled={pending} className={buttonClasses({ variant: "secondary", className: "w-full min-w-0 scroll-mb-32 scroll-mt-20 whitespace-normal" })} onClick={() => router.refresh()}>Recharger le rapport</button> : null}
    {!committed ? <><button type="button" disabled={pending} className={buttonClasses({ variant: "secondary", className: "w-full min-w-0 scroll-mb-32 scroll-mt-20 whitespace-normal" })} onClick={() => submit("review")}>{pending ? "Traitement…" : "Revoir la sélection"}</button>
    {dirty || stale ? <p role="status">Une nouvelle prévisualisation est nécessaire avant confirmation.</p> : null}
    <label className="flex min-w-0 gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={pending || dirty || stale || report.status !== "READY"} />Je confirme les créations retenues</label>
    <button type="button" disabled={pending || !confirmed || dirty || stale || report.status !== "READY"} className={buttonClasses({ className: "w-full min-w-0 scroll-mb-32 scroll-mt-20 whitespace-normal" })} onClick={() => submit("commit")}>Confirmer les créations</button></> : null}
  </div>;
}
