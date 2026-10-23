# Changement vérifié d’email salarié

Une demande EMAIL acceptée par les RH reste `APPROVED_PENDING_VERIFICATION`. L’ancienne valeur demeure celle du dossier jusqu’à finalisation. L’email personnel de contact est indépendant.

## Compte déjà activé

Le titulaire ouvre « Vérifier mon email de connexion » dans son dossier. Une session Auth réelle, un profil salarié actif, l’emploi et l’agence actifs sont requis pour démarrer. Les comptes liés à plusieurs emplois sont bloqués pour arbitrage RH global. Aucune correspondance d’adresse ne réaffecte un emploi.

Le serveur réserve l’adresse, révoque les anciennes invitations de cet emploi, puis appelle `auth.updateUser` avec la session du titulaire. La double confirmation Auth doit rester activée : les liens de l’ancienne et de la nouvelle adresse sont nécessaires. Après confirmation, le titulaire finalise explicitement. La RPC relit `auth.users` et exige le même UUID Auth, l’adresse demandée confirmée et aucun `email_change` restant. Elle met à jour le profil et l’emploi sans changer les UUID ni les droits. Une reprise de finalisation est idempotente.

Une réservation bloque les écritures d’identité concurrentes dans toutes les agences, dans `profiles` et dans Auth. Elle ne bloque ni suspension d’accès, ni départ, ni correction de nom. Si ces accès sont suspendus entre la preuve Auth et la finalisation, les RH peuvent réconcilier la demande sans réactiver le compte ou l’agence.

## Emploi sans compte activé

Les RH envoient une vérification dédiée à la nouvelle adresse. Le jeton aléatoire n’est conservé qu’en SHA-256, expire après 30 minutes et figure dans un fragment URL pour éviter les journaux HTTP. Ouvrir le lien seul ne modifie rien : le destinataire confirme explicitement. Cette preuve change uniquement l’adresse de l’emploi, sans créer de compte et sans rattacher un compte existant. L’invitation d’activation reste une action distincte après finalisation.

Un nouvel envoi explicite, limité à un par minute, invalide le précédent jeton. Les RH peuvent annuler une vérification sans compte. Le job quotidien de rétention annule les preuves expirées et libère leur réservation. Les preuves terminées et les événements de cette extension sont purgés après douze mois.

## Incidents et reprise

Chaque appel Auth possède son UUID de tentative. Seule une réponse définitive de cette tentative peut terminer sa barrière d’exécution ; une réponse tardive d’une ancienne tentative ne peut pas terminer la suivante. Une erreur réseau ou un résultat serveur ambigu laisse cette barrière active. Le serveur refuse alors tout nouvel appel Auth, même après le délai de renvoi. Ne pas remplacer ou effacer la tentative pour tenter de débloquer l’écran.

Les RH utilisent « Réconcilier / annuler ». Si Auth contient la nouvelle adresse confirmée, cette action termine le dossier. Si aucune opération Auth n’a été engagée ou que son résultat définitif indique l’ancienne adresse sans changement en cours, elle peut annuler la demande. Si une tentative demeure indéterminée ou qu’Auth attend encore une confirmation, elle reste en attente. Les suspensions et départs restent possibles.

Un incident indéterminé sans preuve finale nécessite l’examen des journaux Auth et de l’état réel par un opérateur autorisé. L’interface ne possède aucun contournement qui force `email_confirm`, efface la barrière ou attribue un compte sur simple adresse. Aucun jeton brut ne doit être ajouté aux journaux de diagnostic.

## Configuration de livraison

En local, `supabase/config.toml` active `enable_confirmations` et `double_confirm_changes` et autorise `/auth/email-change/callback` sur les deux origines locales existantes. En production, vérifier la double confirmation, le SMTP Auth et l’URL HTTPS exacte du callback dans la liste autorisée avant d’activer ce parcours. Ces paramètres distants n’ont pas été modifiés par cette implémentation.
