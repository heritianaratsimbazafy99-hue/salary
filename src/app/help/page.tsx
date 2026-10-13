import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { getCurrentActor } from "@/lib/admin/auth";
import { AUTH_REQUIRED_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { AccessDenied } from "@/components/shell/AccessDenied";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  let actor: Awaited<ReturnType<typeof getCurrentActor>>;
  try { actor = await getCurrentActor(); }
  catch (error) {
    if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) redirect("/auth/login");
    return <AccessDenied context="Guide d’utilisation" />;
  }
  const managesPayroll = actor.role !== "employee";
  return (
    <AppShell role={actor.role}>
      <article className="mx-auto max-w-3xl space-y-8 text-foreground">
        <header><p className="text-sm font-semibold text-primary">MadajobPay</p><h1 className="mt-2 font-display text-3xl font-bold">Guide d’utilisation</h1><p className="mt-3 text-muted-foreground">Vos fiches internes, de leur publication à leur consultation.</p></header>
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Activer votre espace et vous connecter</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Ouvrez l’invitation reçue et saisissez exactement l’adresse email invitée.</li>
            <li>Demandez votre lien d’activation, puis ouvrez le second email dans le même navigateur. Le lien de confirmation est valable 15 minutes.</li>
            <li>Pour vos prochaines connexions, utilisez « Recevoir mon lien de connexion ».</li>
          </ol>
          <p>Si aucun email n’arrive, vérifiez les indésirables et l’adresse saisie. Une invitation est valable 14 jours ; votre responsable peut la renvoyer. Un renvoi remplace l’ancien lien.</p>
        </section>
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Consulter et conserver une fiche</h2>
          <p>Dans « Mes fiches », choisissez une période dans l’historique. Vous pouvez télécharger le PDF, imprimer la fiche ou exporter vos données en CSV.</p>
          <p>Les fiches restent disponibles pendant un an à compter de leur publication. Téléchargez les documents que vous souhaitez conserver avant leur expiration. Seule la dernière version publiée d’une période est visible.</p>
          <p>Après utilisation, choisissez « Se déconnecter », surtout sur un appareil partagé. Ne transférez jamais un lien de connexion à une autre personne.</p>
        </section>
        {managesPayroll ? <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Préparer et publier une paie</h2>
          <Link className="inline-flex rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground" href="/api/payroll-template" prefetch={false}>Télécharger le modèle Excel</Link>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Remplissez la feuille « payroll » : une ligne par salarié et une seule période par fichier. Gardez les en-têtes du modèle.</li>
            <li>Utilisez un identifiant salarié stable, une adresse email exacte, des dates AAAA-MM-JJ et des montants numériques en Ariary. Le fichier peut contenir jusqu’à 2 000 lignes et peser au maximum 4 Mo.</li>
            <li>Importez le fichier dans l’agence concernée. Classez les colonnes supplémentaires, puis vérifiez les erreurs et toutes les pages de prévisualisation.</li>
            <li>Corrigez les lignes avant publication et contrôlez les nouveaux destinataires. La publication rend les fiches accessibles et déclenche les emails.</li>
            <li>Après publication, une correction passe par un nouvel import de la même période puis une nouvelle publication. L’ancienne version reste inchangée dans le journal interne jusqu’à sa suppression prévue.</li>
          </ol>
          <p>Les lignes invalides ne sont pas publiées. Ne publiez pas un lot tant que les montants et les adresses n’ont pas été validés par votre processus RH.</p>
        </section> : null}
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Obtenir de l’aide</h2>
          <p>Pour une adresse erronée, un accès bloqué ou une fiche à corriger, contactez <a className="font-medium text-primary underline" href="mailto:heritiana.ratsimbazafy99@gmail.com">heritiana.ratsimbazafy99@gmail.com</a>. Indiquez votre agence, la période et le message d’erreur, sans envoyer de lien de connexion ni de copie complète de vos données de paie.</p>
          <p>Cette plateforme diffuse des fiches internes à partir de données de paie déjà validées. Elle ne calcule pas les obligations réglementaires de paie.</p>
        </section>
      </article>
    </AppShell>
  );
}
