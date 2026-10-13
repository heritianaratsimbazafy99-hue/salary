# Ouverture Airtel 300 + Huawei 40

Périmètre : 340 comptes salariés répartis dans deux agences. Le nombre de comptes, le nombre de sessions déjà connectées et le débit de nouveaux emails de connexion sont des capacités distinctes.

## Comptes fournisseurs observés le 13 octobre 2026

| Service | Configuration observée | Conséquence |
| --- | --- | --- |
| Resend | Free, 100 emails/jour, 3 000/mois, 10 requêtes/seconde | Insuffisant pour inviter les 340 salariés en une journée. |
| Resend Pro choisi par le propriétaire | 20 USD/mois, 50 000 emails/mois, sans plafond journalier affiché | Souscription à effectuer par le propriétaire ; le choix ne prouve pas son activation. |
| Supabase Auth SMTP | 720 emails/heure, contre 30 auparavant | Augmentation approuvée par le propriétaire, enregistrée et vérifiée après rechargement du tableau de bord. Le quota Resend continue de s'appliquer. |
| Supabase Auth par IP | Vérification, connexion/inscription et renouvellement : 600/5 min chacun, contre 30/30/150 auparavant | Augmentation approuvée et vérifiée. Un réseau partagé peut concentrer les demandes ; la capacité de rafale reste distincte du débit par intervalle. Les tests locaux ne prouvent pas l'application identique des limites en environnement géré. |
| Supabase production | Free, pool Auth 10, maximum DB 60 | Le pool Auth local non borné n'est pas représentatif de ce projet. |
| Vercel | Node 24, Fluid, région iad1, previews désactivées | Configuration identifiée ; aucune charge de 340 utilisateurs n'a été envoyée en production. |

L'ouverture demande au minimum **680 emails** : 340 invitations et 340 confirmations d'activation. Une connexion ultérieure de chaque salarié ajoute 340 emails. Les confirmations d'activation passent directement par Resend ; les liens de connexion habituels passent par le SMTP de Supabase. API et SMTP partagent le quota du compte Resend.

Le passage à Pro ne supprime pas la limite de requêtes par seconde, les protections Auth par IP ni le plafond SMTP Supabase. Les invitations de publication sont envoyées par lots privés de 100. Les demandes individuelles d'activation et de connexion restent soumises à leurs limites ; organiser l'ouverture progressivement, même si les 340 invitations ont été publiées ensemble.

## Corrections et reprise opérationnelle

- Publication : préparation bornée des invitations, lots de 100 emails, clés d'idempotence distinguant chaque notification, délais et reprises bornés.
- Erreur certaine d'envoi : le responsable peut relancer les invitations ou reprendre les notifications des comptes déjà activés depuis le rapport d'import. La reprise de notifications traite au maximum 20 éléments et affiche le nombre restant.
- Livraison incertaine : vérifier les journaux Resend avant toute nouvelle action. Une interruption après acceptation par le fournisseur peut précéder l'enregistrement en base ; l'application ne renvoie pas aveuglément ce message. Une confirmation incertaine conserve son nouveau lien.
- Limitation Auth : l'interface distingue les demandes limitées d'un lien expiré. Elle indique le parcours adapté pour réessayer.
- Consultations : les plans des contrôles RLS sont réutilisés, mais les décisions d'accès sont recalculées avec les données courantes à chaque requête. Les désactivations et changements d'agence restent immédiats.

## Vérifications reproductibles

Voir [le harnais local](../../scripts/load/README.md). Les données sont fictives et les emails capturés localement. Les résultats détaillés, latences, paramètres d'infrastructure, identifiants de build et preuves de nettoyage sont placés dans `test-results/` (ignoré par Git).

Ne pas déduire une capacité de production garantie d'un benchmark sur le poste de développement. Le harnais teste 340 sessions HTTP distinctes ; il ne lance pas 340 navigateurs ni 340 demandes d'activation avec livraison réelle simultanée. La validation des quotas du compte et l'observation d'une première ouverture progressive complètent ces mesures.

## Avant la première vague réelle

1. Confirmer l'activation de Resend Pro dans la facturation et les quotas réellement disponibles.
2. Observer les protections par IP avec le réseau des agences. Les plafonds ont été adaptés avec accord explicite, sans supprimer les protections ; une rafale instantanée de 340 demandes n'est pas garantie.
3. Vérifier que le commit livré et la migration d'optimisation RLS sont présents en production.
4. Ouvrir une première vague contrôlée, suivre les emails acceptés/refusés et les erreurs Auth, puis augmenter progressivement.

Aucun abonnement, achat, changement de quota de production ou sauvegarde n'est effectué par les scripts de capacité.

Références : [limites Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits), [limites Resend](https://resend.com/docs/api-reference/rate-limit), [envoi par lots](https://resend.com/docs/api-reference/emails/send-batch-emails), [idempotence Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
