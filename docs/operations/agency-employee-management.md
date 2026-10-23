# Gestion des salariés par agence — règles V1

Cette extension gère l’effectif et les fiches internes issues d’une paie déjà validée. Elle ne calcule pas une paie réglementaire ni un solde de tout compte. Le périmètre découle des 18 décisions de la section 12 du [plan validé](../superpowers/plans/2026-10-23-agency-manager-employee-lifecycle.md). Le [contrat SQL](agency-employees-contract.md) décrit les projections et paramètres techniques.

État de livraison : implémentation locale vérifiée. Les résultats détaillés et les limites sont consignés dans le [compte rendu de vérification](../verification/2026-10-23-agency-employees-implementation.md). La présence des migrations dans le dépôt ne prouve pas leur application en production. Aucun déploiement, invitation réelle ou migration distante n’a été effectué.

## Présence, dossier RH et accès

Trois informations restent distinctes :

- `employee_employment_lifecycle.state` indique la présence : `CURRENT`, `DEPARTED`, `TO_REVIEW`.
- Le dossier RH conserve ses statuts et contrats. Une absence de dossier complet reste visible, sans fabrication de contrat, de site ou de département.
- `employees.is_active` contrôle l’accès à cet emploi. Un départ ne le désactive pas. Les restrictions sur un emploi ne doivent pas couper les autres emplois du même compte.

La reprise initiale place les accès désactivés et les anciens dossiers `INACTIVE`/`CONTRACT_ENDED` en `TO_REVIEW`, sans les déclarer partis ni inventer de date. Les autres emplois existants sont `CURRENT`. Une restauration d’accès ne constitue pas une preuve de retour métier. Les épisodes conservent les transitions successives sur le même UUID.

Le stockage partiel `employee_agency_operations` contient poste, département, site et équipe. Lorsqu’un dossier RH complet existe, ses valeurs font autorité et un trigger synchronise cette projection. Une correction agence actualise alors le dossier RH existant et conserve son contrat. Sinon elle complète uniquement le dossier partiel. Un champ nullable envoyé à la sauvegarde représente une valeur vide explicite ; un dossier RH complet ne peut pas être vidé pour contourner ses contraintes.

## Parcours et décisions appliquées

| Décision | Comportement implémenté |
| --- | --- |
| 1 — Création et corrections agence | Matricule, nom et email obligatoires à la création. Nom, poste et organisation modifiables dans l’agence du responsable. Références actives existantes uniquement ; équipe liée au site. |
| 2 — Autorité du nom | Le dossier fait référence. La paie conserve son nom source dans le snapshot et signale une divergence, sans écraser le dossier. |
| 3 — Création minimale | Aucun dossier RH complet ou contrat obligatoire. La complétion reste explicite. Aucun compte Auth ni invitation créé automatiquement. |
| 4 — Départ | Date et motif obligatoires ; affectations non clôturées, remplacements non annulés et congés en attente/approuvés incompatibles bloquent la confirmation. Les RH résolvent ces éléments dans leurs parcours habituels. |
| 5 — Accès après départ | L’archivage conserve l’accès historique et ne modifie pas `is_active`. Une désactivation demeure une action RH séparée. |
| 6 — Dates | Date du jour ou passée uniquement, selon `Indian/Antananarivo`. Départ antérieur à une entrée connue refusé. |
| 7 — Retour | Demande depuis la fiche ; décision RH requise. Même UUID et nouveaux épisodes. Contrat/statut RH existants doivent permettre la date demandée. Accès séparé, aucune réactivation automatique. |
| 8 — Paie après départ | Validation RH attachée à l’empreinte exacte de la revue, puis publication par le responsable. Une modification pertinente invalide cette autorisation. |
| 9 — Import création seule | Identiques ignorés ; divergences bloquées. Aucun écrasement de nom, archivage par absence ou retour implicite. |
| 10 — Atomicité import | Créations des lignes retenues dans une transaction. Une erreur ou un conflit annule le lot. L’exclusion exige une nouvelle prévisualisation. |
| 11 — Invitations explicites | Envoi individuel ou sur sélection après création ; jobs durables et reprise séparés du succès de création. Aucun envoi d’activation pour un compte déjà rattaché, un départ ou un accès désactivé. |
| 12 — Identité | Demande RH persistée pour matricule/email, avec motif, révisions et suivi. Matricule canonique partagé : 1 à 80 points Unicode, espaces de bord normalisés et casse ASCII canonique. Une collision d’un compte existant à la création agence est orientée vers RH sans rapprochement automatique. |
| 13 — Contrat | Type et dates lisibles dans la projection agence ; aucune écriture ni accès au document signé. Informations manquantes à compléter par RH. |
| 14 — Manager RH | Lecture et demande de changement. Décision RH après contrôle du rôle actif, de l’agence et du périmètre réel du manager. Aucun rôle accordé. |
| 15 — Imports temporaires | Aucun fichier source conservé en Storage ; analyse en mémoire. Prévisualisations, lignes et erreurs expirent après 30 jours maximum. |
| 16 — Audit | Événements minimaux de l’extension expirant après douze mois calendaires UTC ; purge quotidienne ciblée. Aucun jeton brut, fichier ou copie systématique des données privées dans l’audit. |
| 17 — Dossiers archivés | Aucun effacement automatique des salariés, dossiers ou épisodes. La purge des fiches de paie conserve sa politique indépendante d’un an UTC. |
| 18 — Transferts | Aucun transfert d’agence disponible dans cette extension. Traitement RH distinct ; aucun déplacement des anciennes fiches ou droit implicite sur une autre agence. |

Les corrections de matricule sont bloquées tant que des invitations en attente ou des paies non publiées dépendent du matricule courant. Les identifiants précédents figurent dans la demande, sans fusion. Une demande obsolète ne s’applique pas par-dessus une correction concurrente : recharger, vérifier et soumettre une nouvelle demande après traitement de la précédente.

Pour l’email, `APPROVED_PENDING_VERIFICATION` signifie une décision RH favorable, pas un changement effectué. Un compte lié doit passer le changement sécurisé Auth et confirmer la nouvelle adresse ; sans compte lié, le destinataire doit prouver la possession de l’adresse par lien à durée limitée. Les conséquences invitations sont traitées séparément et le statut ne devient `EXECUTED` qu’après vérification. Les situations multi-emplois restent soumises à arbitrage RH, afin de ne pas modifier silencieusement l’identité de plusieurs agences.

## Autorisations et traçabilité

Les responsables d’une même agence partagent l’annuaire et les capacités. Les auteurs restent distincts dans les événements et demandes. Le rôle `team_manager` conserve son périmètre existant ; cette extension ne lui accorde pas de droits de responsable d’agence.

Les mutations utilisent des RPC réservées à `service_role`, appelées depuis le serveur avec le profil réel. Chaque RPC revérifie profil actif, rôle, rattachement courant et agence active. Les lectures utilisent des RPC de session à projection explicite ; aucune ouverture des tables privées, documents, CNAPS ou coordonnées personnelles. L’UUID d’une URL et l’agence d’un formulaire ne donnent aucun droit.

Chaque sauvegarde exige les révisions courantes de l’identité et des opérations. Le départ et les demandes exigent aussi celle du lifecycle ; le changement de Manager RH fige la révision du dossier RH. Les mises à jour d’identité, y compris les autres voies de gestion d’accès et de rattachement, incrémentent la révision via trigger. Un conflit renvoie `PT409`, sans stratégie de remplacement silencieux.

Les événements de correction et transition contiennent les versions avant/après et les champs concernés. Le motif saisi reste dans un stockage restreint ; l’historique agence présente uniquement les métadonnées minimales et le nom de l’auteur. L’audit est écrit dans la même transaction : son échec annule la mutation. Les demandes conservent leurs motifs et décisions selon les droits de consultation de l’agence/RH. Toutes les demandes actives restent visibles indépendamment du volume ; seul l’historique des demandes terminées est limité aux 500 dernières.

## Exploitation et contrôles

L’import indépendant accepte au maximum 4 Mo et 1 000 lignes salariés. Sa purge horaire retire les imports expirés et leurs lignes, y compris les détails de rapports. La trace minimale de confirmation subsiste uniquement jusqu’à sa propre expiration d’audit. Le job `agency-employee-audit-retention` purge les événements expirés chaque jour à 04:20 UTC ; il ne cible aucune table de dossier ou d’épisode.

Les invitations ont un traitement durable après commit. Les tentatives recontrôlent les droits et l’état de l’emploi ; une erreur fournisseur n’efface pas le salarié. Un job d’invitation n’est pas une preuve d’envoi réussi. Voir le contrat pour le rythme des reprises et les délais d’idempotence.

Pour vérifier les fondations, exécuter `scripts/tests/agency-employee-management.sql` sur le Supabase local du projet, après les migrations. La suite est transactionnelle avec rollback : rôles anon/authenticated/service_role, isolation inter-agences, ancien JWT après désactivation, création minimale, collision email, révisions, rollback audit, synchronisation RH, départ/retour, demande email, conflits de planning et purge ciblée. Compléter avec les suites imports, paie/invitations et email vérifié, les suites SQL déjà présentes en CI et les parcours E2E locaux. L’orchestrateur possède les resets et services partagés ; aucun test destructif en production.

Avant une livraison distante, vérifier les gates, les identifiants réels des projets et la migration effectivement appliquée. Aucune preview Vercel sans demande explicite. La durée définitive des dossiers RH et épisodes reste à décider avant toute automatisation de leur purge ; les sauvegardes restent reportées selon la décision du propriétaire.
