import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { listOwnEmailChanges } from "@/lib/employees/identity-change";
import { EmailChangeForm } from "./EmailChangeForm";
export default async function EmailChangePage() {
  let entries;
  try { entries = await listOwnEmailChanges(); }
  catch { return <main className="mx-auto grid max-w-lg gap-6 p-6"><h1 className="text-2xl font-semibold">Vérifier mon nouvel email</h1><p>Connectez-vous avec le compte salarié concerné pour poursuivre. Si votre accès a été suspendu, les RH peuvent réconcilier la demande après vérification.</p><Link href="/auth/login">Me connecter</Link></main>; }
  return <AppShell role="employee"><div className="mx-auto grid max-w-2xl gap-6 p-6"><Link href="/employee/profile">Retour à mon dossier</Link><h1 className="text-2xl font-semibold">Vérifier mon nouvel email</h1><p>Une approbation RH autorise la vérification. Votre adresse reste effective jusqu’à la confirmation du titulaire et de la nouvelle adresse. Si votre compte possède plusieurs emplois, contactez les RH pour un arbitrage global.</p>{entries.length ? entries.map(q => <section className="grid gap-3 rounded-xl border p-5" key={q.id}><h2 className="font-semibold">{q.requested_value}</h2>{q.status === "EXECUTED" ? <p>Changement réalisé.</p> : <><p>Acceptée par les RH — en attente de vérification.</p><EmailChangeForm requestId={q.id} /></>}</section>) : <p>Aucune demande approuvée à vérifier.</p>}</div></AppShell>;
}
