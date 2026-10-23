# Extension du responsable d’agence — gestion du cycle de vie des salariés

Mise à jour après exécution : l’implémentation et les correctifs de dépendances sont vérifiés localement ; voir les [preuves fonctionnelles](../../verification/2026-10-23-agency-employees-implementation.md) et le [rapport dépendances](../../verification/2026-10-23-dependency-security-update.md). La conception ci-dessous conserve son état historique de validation du périmètre.

Date : 23 octobre 2026. Statut : **périmètre V1 validé par le propriétaire, implémentation non démarrée**.
Référence examinée : commit `73a2ef1cdd540a6062a887ea5275b294d40c98c9` et fichiers du répertoire de travail. Analyse statique du dépôt uniquement ; aucune preuve d’exécution ni de configuration actuelle de production n’est revendiquée.

> Les 18 décisions de la section 12 ont été validées individuellement dans la conversation. Elles font autorité sur les recommandations et mentions « à confirmer » de la conception technique ci-dessous. Les choix techniques restent à mettre en œuvre et à vérifier ; cette validation de périmètre ne demande ni implémentation ni publication.

## 1. Résultat visé et limites

Permettre à chaque `agency_manager` de créer et importer les salariés de son agence indépendamment d’une paie, corriger les informations autorisées et enregistrer leurs départs. Plusieurs responsables de la même agence ont les mêmes capacités ; chaque action reste attribuée à son auteur. Le rôle `team_manager` (Manager RH) conserve son périmètre actuel.

L’application diffuse des fiches internes issues d’une paie validée. Cette extension ne calcule ni solde de tout compte ni droits réglementaires. Elle n’accorde pas par défaut accès aux pièces privées, coordonnées personnelles, CNAPS, congés, soldes, demandes RH ou administration des comptes.

Ce document est le seul livrable de cette tâche : aucune fonctionnalité développée, migration créée ou appliquée, modification de base, invitation envoyée, opération Git distante ou publication. Les documents locaux préexistants sont conservés.

## 2. Faits vérifiés et sources

Les chemins ci-dessous sont relatifs à la racine du dépôt. Les symboles cités identifient le comportement à vérifier lors de l’implémentation ; les migrations ultérieures priment sur les définitions initiales.

| Fait vérifié | Source du dépôt |
| --- | --- |
| Une seule agence par responsable via `agency_memberships.unique(profile_id)`, mais pas d’unicité sur `agency_id` : plusieurs responsables sont possibles. | `supabase/migrations/202606260001_core_schema.sql:65-73` ; `src/lib/admin/auth.ts` |
| La gestion de paie exige `agency_manager` et égalité des agences ; elle n’est pas réservée au créateur de l’import. | `src/lib/admin/permissions.ts`, `canManagePayrollForAgency` ; `src/lib/payroll/publish.ts`, `publishPayrollImport` ; `supabase/migrations/20261014231000_employee_identity_canonicalization.sql`, contrôle acteur de publication |
| `agency_manager` et `team_manager` sont des rôles distincts. Le menu du premier ne propose actuellement que les imports. | `src/lib/roles.ts` ; `src/components/shell/RoleNav.tsx:36` ; `src/components/shell/AppShell.tsx` |
| Une création individuelle hors paie existe déjà pour RH/superadmin, avec dossier opérationnel et contrat ; pas de parcours équivalent du responsable d’agence identifié. | `src/lib/hr/employees.ts`, `createEmployee` ; `src/app/hr/employees/page.tsx` ; RPC `hr_create_employee` dans la migration d’identité du 14 octobre |
| L’annuaire RH exclut explicitement `agency_manager`. La lecture du dossier RH complet charge aussi des données privées. | `supabase/migrations/20261014120000_hr_employee_records.sql`, `hr_employee_directory` ; `src/lib/hr/employees.ts`, `getEmployeeFileForHr` ; `src/app/hr/employees/[employeeId]/page.tsx` |
| Le matricule est unique par agence après normalisation ASCII partagée, y compris pour les salariés désactivés. Les UUID constituent les liens durables. L’email est unique par agence dans `employees` et global dans `profiles` ; `employees.profile_id` n’est pas unique. | `src/lib/employees/identity.ts` ; `supabase/migrations/202606260001_core_schema.sql:54-91` ; `supabase/migrations/20261014231000_employee_identity_canonicalization.sql` ; `docs/operations/employee-identity.md` |
| La publication crée les identités inconnues et actualise le nom existant, sans changer silencieusement l’email. Elle bloque salarié désactivé, email divergent et collision d’identité. Aucune boucle d’archivage des absents n’existe dans cette publication. | `src/lib/payroll/import-service.ts`, `validateEmployeeIdentities` ; `supabase/migrations/20261014231000_employee_identity_canonicalization.sql:142-178` ; `src/lib/employees/linking.ts` |
| L’import/revue de paie possède une empreinte ; le commit SQL précède les invitations et emails. L’empreinte actuelle couvre import et lignes, pas une révision générale du dossier salarié. | `src/lib/payroll/manager-review.ts` ; `src/lib/payroll/publish.ts:91-130` ; `supabase/migrations/20261014231000_employee_identity_canonicalization.sql`, `get_payroll_import_review` |
| Le statut RH (`ACTIVE`, `ON_LEAVE`, `INACTIVE`, `CONTRACT_ENDED`) est distinct de `employees.is_active`. Les dossiers RH et privés ont déjà une `revision`, contrairement à l’identité `employees`. | `supabase/migrations/20261014120000_hr_employee_records.sql:7-60` ; schéma initial `employees` |
| La désactivation actuelle d’un emploi modifie `employees.is_active` et journalise l’action ; elle ne révoque pas elle-même les sessions Auth ni les invitations. Les contrôles RLS coupent les lectures concernées. Un profil salarié reste utilisable s’il a un autre emploi actif dans une agence active. | `src/lib/admin/users.ts`, `setEmployeeAccess` ; `supabase/migrations/20261013092414_administration_access_lifecycle.sql`, `admin_set_employee_access`, `employee_access_active` ; `supabase/migrations/20261014090100_hr_foundations.sql`, `current_profile_id` |
| Les écritures métier sensibles utilisent des RPC de service. L’ancien INSERT direct `employees` pour un utilisateur connecté a été révoqué. | `supabase/migrations/202606300001_close_rescan_findings.sql:6-10` ; RPC RH et administration |
| Les coordonnées personnelles/CNAPS sont séparées, les documents ont leurs propres politiques et endpoints. La protection de ligne ne remplace pas une restriction de colonnes. | `src/lib/hr/employees.ts`, `PrivateDetails` ; `supabase/migrations/20261014150000_hr_employee_documents.sql` ; `src/lib/hr/documents.ts` |
| Modifier les dates de contrat peut invalider des affectations/remplacements ; des contraintes métier existent déjà. | `supabase/migrations/20261014190000_hr_assignments_replacements.sql`, contrôle `contract_conflict` ; `src/lib/hr/employees.ts`, `recordError` |
| Les fiches/versions/imports expirent après un an calendaire UTC. La purge de paie ne supprime ni salariés, ni profils, ni comptes Auth, et ne définit pas la conservation de toutes les pièces RH. | `docs/operations/payroll-retention.md` ; `supabase/migrations/20261013092927_payroll_one_year_retention.sql` |

**Correction de documentation à inclure dans la future réalisation :** le texte du dossier RH affirmant que nom et email sont mis à jour par les imports (`src/app/hr/employees/[employeeId]/page.tsx`, vers ligne 97) contredit le contrôle actuel de l’email. Le remplacer par une description exacte après arbitrage de l’autorité sur le nom.

## 3. Périmètre des champs et décisions métier

Cette matrice présente la proposition initiale. La section 12 consigne le périmètre métier désormais validé ; aucun droit technique n’a encore été modifié.

| Donnée / action | Proposition pour le responsable de l’agence | Limite / décision |
| --- | --- | --- |
| Matricule, nom complet, email initial | Saisie obligatoire lors de la création individuelle ou par fichier ; prévisualisation avant confirmation. | Aucun rattachement automatique d’un compte existant sur simple email. |
| Nom complet existant | Correction explicite avec motif, révision et audit. | Décider que le dossier est la référence et que la paie ne réécrit plus ce nom, proposition recommandée. Le snapshot de paie garde le nom issu de sa source validée. |
| Matricule existant | Lecture ; demande de correction à RH. | Mutation RH contrôlée si retenue : dépendances des invitations/imports en attente, unicité, ancien identifiant tracé ; pas de fusion. |
| Email de connexion existant | Lecture dans son agence ; demande de changement à RH. | Ne pas assimiler à l’email personnel de contact. Correction directe par responsable exclue du premier lot. |
| Poste | Édition proposée si un dossier RH existe. | Pour un dossier incomplet, ne pas inventer contrat/site/département obligatoires. |
| Département, site, équipe | Sélection de références actives de la même agence, si délégation validée. | Pas de création de référentiel. Équipe rattachée au site choisi. Distinguer organisation du dossier et affectations datées. |
| Manager du dossier | Lecture ; édition soumise à validation propriétaire. | Choix dans les `team_manager` éligibles à l’agence ; n’accorde pas de rôle ni de périmètre RH. |
| Date d’entrée / contrat | Collecte éventuelle comme information à valider par RH. | Le contrat actuel n’est pas un historique de tous les emplois ; décider si entrée = début de contrat. Ne pas créer des valeurs fictives. |
| Départ / archivage métier | Enregistrement proposé : date effective, motif codifié minimal, confirmation et audit. | Décider effet immédiat ou validation RH, dates futures/rétroactives et traitement des affectations actives. |
| Statuts RH existants | Lecture ciblée ; transition par une action métier contrôlée. | Pas de liste déroulante permettant librement `ON_LEAVE`, `INACTIVE` ou `CONTRACT_ENDED`. |
| Type/dates de contrat | Lecture seulement si le propriétaire valide leur visibilité ; écriture RH initialement. | Changer un contrat n’est pas une conséquence implicite du droit d’archiver. |
| Coordonnées privées, urgence, CNAPS | Aucun nouveau droit. | Toute délégation future nécessite une décision champ par champ et des DTO/politiques spécifiques. |
| Documents, dont contrats signés et pièces d’identité | Aucun nouveau droit de lecture, téléchargement, dépôt ou retrait. | Les métadonnées de contrat n’autorisent pas le document. |
| Accès à l’emploi, compte Auth, rôles, transfert d’agence | Pas de mutation directe dans le premier lot ; demande à RH. | Une révocation globale peut affecter d’autres agences. Aucun changement de `agency_id` ou `profile_id` soumis par le navigateur. |
| Retour / réactivation | Demande de retour, traitée par RH initialement. | Même UUID, pas de nouvelle identité de substitution ni réactivation implicite par fichier. |

## 4. Modèle proposé et migrations à préparer ultérieurement

### 4.1 Séparer emploi, état du dossier et accès

Conserver `employees.id`, les clés `(agency_id, employee_id)` et les contraintes d’email. Ne pas utiliser `is_active` comme synonyme de départ. Ne pas déduire automatiquement le départ de `employee_hr_records.status` : `INACTIVE` et `CONTRACT_ENDED` ne prouvent pas la même situation métier.

Proposer une table `employee_employment_lifecycle` pour tous les salariés, même sans dossier RH : `employee_id` PK, `agency_id`, `state` (`CURRENT`, `DEPARTED`, éventuellement `TO_REVIEW` pour les reprises ambiguës), `started_on` nullable, `departed_on` nullable, motif codifié nullable, `revision`, auteur/date de dernière transition. FK composite `(employee_id, agency_id)` vers `employees`, dates cohérentes et index agence/état. Les noms définitifs restent à fixer.

Le lifecycle proposé est la source de vérité de la présence dans l’effectif ; le statut RH décrit la situation opérationnelle et `is_active` l’accès. Définir une table de transitions autorisées avant la migration : un départ ne doit pas laisser le salarié sélectionnable pour une nouvelle affectation ou comme remplaçant, même si son ancien statut RH vaut `ACTIVE`. Adapter les lecteurs et validations de `src/lib/hr/planning.ts` et des RPC de planning pour tenir compte du lifecycle. La synchronisation éventuelle vers `CONTRACT_ENDED` exige une décision RH sur le contrat ; ne pas la déduire automatiquement du départ. Les lignes `TO_REVIEW` conservent les comportements existants jusqu’à arbitrage, sans leur attribuer une date fictive.

Garder un journal de transitions permettant un retour après départ sans effacer les périodes précédentes. Pour un retour, clôturer l’épisode de départ et ouvrir un épisode d’emploi ; ne pas écraser sa preuve. L’archivage retire le salarié de la liste active par défaut, mais le rend retrouvable dans « Archives ».

Ajouter une `revision` d’identité sur `employees`. Toutes les voies d’écriture pertinentes — gestion agence, RH, rattachement, publication de paie et accès administratif — doivent participer au contrôle de concurrence. Les révisions de dossier RH et de cycle de vie restent distinctes ; une opération portant sur plusieurs objets vérifie toutes leurs versions dans une transaction. Prévoir une règle SQL commune d’incrément pour ne pas oublier un chemin de mutation.

### 4.2 Import de salariés indépendant

Tables proposées `employee_imports` et `employee_import_rows`, séparées des tables de paie : agence, auteur, statut, dates/expiration, version de format, empreinte du contenu normalisé, clé d’idempotence, statistiques ; lignes avec numéro source, données minimales, classification/erreurs et révisions attendues. Aucun montant, période de paie, bulletin ou notification de paie. États proposés : `DRAFT`, `INVALID`, `READY`, `COMMITTED`, `EXPIRED` ; revoir toute modification après prévisualisation.

Une confirmation atomique crée les identités, l’état métier et les événements d’audit. Elle produit les travaux d’invitation après commit si cette option est validée. Un job durable avec clé unique par opération/destinataire permet reprise sans dupliquer les comptes ni les envois ; échec d’email ≠ échec de création de salarié. Ne pas stocker de jeton brut dans la prévisualisation, le journal ou les lignes d’import.

### 4.3 Reprise et déploiement du schéma

Créer de nouvelles migrations datées lors de l’implémentation, sans réécrire les migrations appliquées. Séparer : (1) tables/colonnes/contraintes, (2) backfill et vérification, (3) fonctions/policies et intégration paie. Préflight des incohérences, dossiers absents, états RH existants, liens multi-agences et doublons ; rapport chiffré sans informations personnelles dans les logs publics.

Ne pas transformer tous les `is_active=false` en départs : ces valeurs peuvent correspondre à une restriction d’accès. Reprise proposée : état connu confirmé, sinon `TO_REVIEW` avec traitement RH ; aucune date de départ inventée. Ne pas déclencher de suppression, invitation ou nouvelle habilitation pendant la migration. Préserver les fiches et snapshots. Valider le coût des index/verrous et la compatibilité avec l’ancienne application. Retour arrière applicatif par désactivation du nouveau parcours, sans suppression des nouvelles données ; rollback destructif interdit par défaut.

## 5. Permissions serveur, RLS et isolation

Créer une capacité dédiée `canManageAgencyEmployees` et un service `src/lib/employees/agency-management.ts`. **Ne pas élargir `canManageHrReferential`**, qui ouvre aujourd’hui des fonctions RH beaucoup plus larges.

Pour chaque lecture et écriture : résoudre le profil depuis la session serveur ; recontrôler profil actif, rôle, rattachement et agence active. L’agence n’est jamais une autorité issue du corps HTTP. Charger la ressource par UUID avec son agence et comparer au rattachement réel. Faire les mêmes contrôles à la confirmation, à l’envoi différé et après tout changement d’affectation du responsable. `uploaded_by` attribue l’action mais ne constitue pas une restriction de propriété pour les autres responsables de l’agence.

Lectures : client de session soumis à RLS, ou RPC de lecture dédiée avec projection explicite des seuls champs autorisés. Ne pas charger `getEmployeeFileForHr` puis masquer ses onglets. Les tables de lifecycle/import autorisent lecture aux responsables de leur agence et RH/superadmin selon leurs fonctions ; aucune nouvelle lecture pour `team_manager`, `client_viewer` ou salarié sans exigence métier explicite. Revoir les politiques `employees` existantes sans supprimer les restrictions d’accès/expiration déjà appliquées aux salariés et fiches.

Écritures : RPC dédiées appelées côté serveur avec `service_role`, pas de DML direct accordé à `authenticated`. Chaque RPC revalide l’acteur et les FK d’agence en base. Révoquer `EXECUTE` à `PUBLIC`, `anon`, `authenticated` pour les RPC acceptant un acteur fourni par le serveur ; limiter à `service_role`. Fonctions `SECURITY DEFINER` avec `search_path` fixé, noms qualifiés, validation fermée des champs et aucune substitution d’acteur client. Si une RPC est exposée à une session, dériver l’acteur de cette session et ne jamais accepter son ID librement.

Une RLS sur les nouvelles lignes ne suffit pas : vérifier les RPC, exports de rapport, recherches, compteurs, erreurs, jobs d’invitation et URLs devinées. `service_role` contourne RLS ; chaque lecture privilégiée porte une vérification d’agence explicite. Refuser les champs hors liste au serveur et dans le contrat SQL. Les erreurs ne révèlent pas l’agence ou l’identité d’un tiers : « identité à vérifier par RH » pour un conflit global.

## 6. Parcours et import

Ajouter « Salariés » à `src/components/shell/RoleNav.tsx`, avec pages dédiées proposées :

- `/manager/employees` : liste paginée, recherche nom/matricule, filtres actifs/archives/à vérifier ; badges séparés « Situation d’emploi », « Accès », « Invitation », « Dossier RH incomplet ».
- `/manager/employees/new` : création minimale hors paie, contrôle identité, résultat et invitation séparée.
- `/manager/employees/[employeeId]` : données autorisées, historique minimal, modification avec révision, départ et demande de retour ; aucun onglet privé repris du dossier RH.
- `/manager/employees/imports/new` et `/manager/employees/imports/[importId]` : modèle téléchargeable, chargement, prévisualisation, confirmation et rapport partagé dans l’agence, attribution des actions distincte.

Composants proposés dans `src/components/employees/` : `AgencyEmployeeDirectory`, `AgencyEmployeeForm`, `EmployeeDepartureDialog`, `EmployeeImportUploadForm`, `EmployeeImportPreview`, `EmployeeImportResult`. Réutiliser les primitives UI existantes ; vérifier clavier, labels, focus, erreurs par champ, annonces de traitement et rendu mobile. Afficher explicitement qu’un fichier absent ne provoque aucun départ.

Import V1 recommandé : XLSX dédié, colonnes `matricule`, `nom_complet`, `email`, champs opérationnels seulement s’ils sont arbitrés. Réutiliser les garde-fous de `src/lib/payroll/xlsx-guard.ts` et le lecteur `workbook-reader.ts` avec un schéma indépendant. La limite existante de 4 Mo est une base à confirmer ; proposer un plafond de 1 000 lignes validé sur le volume 300 + 40, limiter aussi temps, mémoire et expansion ZIP. Ne pas accepter un fichier de paie comme import salarié sans contrat de colonnes explicite. Refuser les cellules d’identité à formule ; conserver les matricules en texte, dont les zéros initiaux. Neutraliser les formules dans les éventuels exports d’erreurs.

Séquence :

1. Contrôler fichier/type/taille/complexité et autorisation avant persistance. Normaliser matricule avec `canonicalEmployeeId` et email selon la règle partagée ; pas de rapprochement par nom.
2. Classer chaque ligne : **nouveau**, **déjà existant identique** (ignoré), **modification à examiner**, **doublon de fichier**, **conflit d’identité**, **archivé/désactivé nécessitant RH**, **référence invalide**. Une même clé canonique répétée reste bloquante, même si les deux lignes sont identiques.
3. Matricule existant + email différent : blocage, jamais réaffectation. Email existant + autre matricule : blocage. Même email dans une autre agence ou compte avec un autre rôle : contrôle privilégié sans divulgation, arbitrage RH avant rattachement. Aucun « merge » automatique.
4. Pour V1, recommander **création seule** : les lignes existantes modifiées renvoient à la fiche individuelle. Un mode d’actualisation en masse, s’il est demandé ensuite, présente un diff par champ et n’autorise que la liste blanche ; cellule vide ne signifie jamais effacement implicite.
5. Prévisualiser comptes, erreurs par ligne, effets et destinataires éventuels. Bloquer confirmation tant que des lignes conflictuelles subsistent ; choix recommandé tout-ou-rien, pas de succès partiel silencieux. Une exclusion volontaire de ligne recrée une revue et ses compteurs.
6. Lier la confirmation à une empreinte serveur couvrant contenu normalisé, agence, mode, options, version de schéma et révisions des entités concernées. Recharger autorisations et identités dans la transaction de confirmation ; contraintes uniques et verrous couvrent aussi les nouveaux salariés sans révision antérieure.
7. Une revue périmée renvoie 409 et un nouveau diff ; un double clic ou retry renvoie le même résultat via idempotence. Rapport final : créés, ignorés, erreurs, auteur du chargement et de confirmation, invitation en attente/envoyée/échouée séparément. Aucune fiche de paie créée.

## 7. Identité, email, invitations et paie

**Nom :** décider l’autorité avant de donner le droit d’édition. Recommandation : le dossier devient la référence de l’identité courante ; la publication conserve le nom de la source dans le snapshot de fiche mais ne réécrit plus `employees.full_name` pour un salarié existant. Adapter aussi `linking.ts`, qui écrit l’identité, afin qu’il ne réintroduise pas cet écrasement après le commit. Toute divergence doit être visible lors de la revue de paie. Garder l’ancien nom des fiches publiées ; tester les pages/PDF/export pour s’assurer qu’ils utilisent le snapshot attendu.

**Email :** ne pas implémenter une simple modification de `employees.email`. Créer, si retenu, une demande RH avec état, ancien/nouvel email, motif et révision. Vérifier les collisions globales, le contrôle de la nouvelle adresse, l’autorité du demandeur et les liens du compte à d’autres emplois. Prévoir étape de vérification puis finalisation contrôlée entre Auth, `profiles`, emploi(s) concernés et invitations ; ce n’est pas une transaction SQL atomique unique. Une procédure reprenable et idempotente gère les échecs intermédiaires, interdit les envois à une adresse périmée et garde une trace sans jeton ni donnée personnelle excessive. Informer les adresses concernées selon le protocole validé. Ne jamais déplacer les fiches vers un autre profil sur simple correspondance d’email.

**Invitations :** décider si la création hors paie crée seulement une fiche ou propose aussi « Inviter ». Recommandation : création persistée d’abord, invitation explicite et séparée, avec vérification de l’état du salarié au moment de l’envoi. Réutiliser les primitives sûres de `src/lib/employees/linking.ts`, `invitations.ts`, `resend-invitations.ts`, mais découpler le nouveau parcours d’un ID d’import de paie. Ne pas appeler aveuglément la fonction de provisioning si elle peut réécrire un nom corrigé. Contrôler email, agence, état et profil avant rattachement/acceptation ; reprise et clé d’envoi stable. Prévoir un email de bienvenue sans annonce de fiche publiée et préserver la preuve de possession de l’adresse dans `src/lib/employees/activation.ts` : le jeton d’invitation seul ne suffit pas. Conserver une limitation des renvois et annuler les invitations obsolètes avant remplacement. Un départ annule les jobs/invitations propres à cet emploi selon la décision d’accès, jamais ceux d’un autre emploi. L’activation d’une invitation ancienne doit recontrôler le lifecycle. Tenir compte des quotas documentés dans `docs/operations/capacity-airtel-huawei.md` sans supposer Resend Pro effectivement activé.

**Paie après départ :** proposition : bloquer la création implicite et la réactivation d’un salarié archivé, mais ne pas interdire sans arbitrage une fiche tardive pour une période travaillée ou une correction historique. Définir une validation RH explicite pour ce cas, qui ne remet pas l’emploi en activité et ne recrée pas d’accès. Élargir les contrôles de revue/publication aux états métier et aux révisions d’identité ; invalider une revue si un départ, changement d’email ou de nom intervient entre revue et commit. Conserver les contrôles de conflits SQL existants. L’absence d’un salarié dans tout fichier reste sans effet sur son emploi.

## 8. Départ, retour et dépendances RH

L’écran de départ présente la date, l’effet sur la liste, les éléments en cours et l’effet sur les accès. Recommandation initiale : départ métier par responsable, accès conservé séparément tant que RH n’a pas décidé sa coupure. Cette proposition doit être validée avant livraison ; si une coupure automatique est choisie, elle doit viser l’emploi concerné, pas le compte global.

À la confirmation, verrouiller salarié/lifecycle/dossier pertinent ; vérifier contrat, affectations et remplacements à cheval sur le départ, congés/demandes ouverts et invitations en attente. Montrer seulement les informations autorisées au responsable ; les autres conflits sont formulés comme « validation RH requise ». Proposer un blocage avec résolution RH lorsque des éléments dépassent la date, sans annuler silencieusement congés ni soldes, raccourcir un contrat ou supprimer des affectations. Les corrections de date et départs rétroactifs ont leur propre motif et révision. Pour V1, recommander date effective au plus tard aujourd’hui ; une programmation future nécessite une exécution idempotente, un fuseau métier explicite et une annulation tracée.

Le retour nécessite contrôle de l’agence active, identité, contrat et état d’accès. Réutiliser l’UUID et conserver les anciennes périodes et fiches ; RH confirme la réouverture métier et, séparément, la réactivation d’accès. Ne pas recréer un salarié pour contourner une désactivation. Un transfert d’agence reste un parcours RH distinct ; aucun déplacement direct d’une identité qui entraînerait implicitement ses historiques vers une autre agence.

Le fait d’archiver ne purge aucune donnée. La rétention de paie d’un an reste inchangée, y compris pour un salarié parti ; ne pas renouveler `expires_at` lors d’un changement de dossier. Définir séparément avec le propriétaire la durée des dossiers, épisodes d’emploi, demandes d’identité, imports salariés, erreurs et audits. Proposition technique : fichier brut non conservé après traitement, brouillon/erreurs à durée courte configurable ; ne pas appliquer arbitrairement la purge de paie aux pièces RH. Pas de nouvel abonnement de sauvegarde dans ce chantier.

## 9. Traçabilité et modifications concurrentes

Chaque mutation et confirmation écrit dans la même transaction un événement : acteur réel, rôle, agence, UUID salarié/import, action, date serveur, révisions avant/après, champs modifiés, motif codifié et identifiant de corrélation/idempotence. Conserver séparément auteur du chargement, auteur de la revue/confirmation et initiateur d’une invitation ; deux responsables ne deviennent pas indiscernables parce qu’ils partagent une agence.

Événements proposés : `employee.created`, `employee.updated`, `employee.departed`, `employee.return_requested`, `employee.returned`, `employee.identity_change_requested`, `employee_import.committed`, `employee.invitation_requested`. Les valeurs avant/après sensibles ne doivent pas entrer automatiquement dans les métadonnées génériques ; si nécessaires à l’audit RH, stockage restreint et durée dédiée. Le responsable ne reçoit qu’un historique minimal de son agence ; ne pas lui ouvrir le journal global `audit_logs`. Échecs d’accès et d’envoi restent observables sans contenu de fichiers ni secrets.

Un formulaire transmet les révisions attendues. Mise à jour conditionnelle/contrôle sous verrou ; si une autre personne ou la paie a modifié les mêmes données, erreur 409, rechargement et comparaison visible, aucune stratégie « dernier enregistrement gagnant ». Ordre stable de verrouillage des salariés par UUID pour les lots ; recontrôle d’unicité en base ; tester les courses création/import/paie/départ et RH/responsable. Une action inchangée peut être traitée comme no-op, sans événement trompeur.

## 10. Étapes et fichiers concernés

Les nouveaux chemins ci-dessous sont proposés et n’existent pas nécessairement. Chaque lot reste désactivable jusqu’à validation de ses tests et décisions.

| Lot / dépendance | Travail et fichiers | Preuve attendue |
| --- | --- | --- |
| 0 — arbitrages | Valider section 12 ; documenter champ par champ, autorité nom, départ/accès et matrice de rôles dans `docs/operations/agency-employee-management.md` à créer. | Scénarios approuvés et absence de droits implicites. |
| 1 — fondations | Nouvelles migrations `supabase/migrations/<timestamp>_agency_employee_lifecycle.sql` et `<timestamp>_agency_employee_permissions.sql` ; états, révisions, RPC, RLS, audit et reprise. | Tests SQL d’isolement/backfill/concurrence avant écran d’écriture. |
| 2 — consultation et création | `src/lib/admin/permissions.ts`, `auth.ts`, nouveau `src/lib/employees/agency-management.ts`, schémas dédiés ; nouvelles pages/composants de section 6 et `RoleNav.tsx`. Lecture minimale de référentiels existants. | Création hors paie avec identité stable, affichage des dossiers incomplets et protections inter-agences. |
| 3 — correction et cycle de vie | RPC création/mise à jour/départ/demande de retour ; nouveaux handlers `src/app/api/manager/employees/...` ou server actions dédiées, choix unique lors du développement ; intégration contrôlée `src/lib/hr/employees.ts`, `src/lib/admin/users.ts`. | Révisions, audit, impacts RH et accès séparés ; aucun accès aux endpoints privés. |
| 4 — compatibilité paie, obligatoire avant ouverture de l’édition | `src/lib/payroll/import-service.ts`, `manager-review.ts`, `publish.ts`, `src/lib/employees/linking.ts` ; nouvelles définitions SQL des RPC revue/publication ; libellé dossier RH. | Un import de paie n’écrase pas une correction, ne réactive pas un départ ; snapshot historique inchangé. |
| 5 — import salarié | `<timestamp>_agency_employee_imports.sql`, `src/lib/employees/import-{schema,parser,service}.ts`, pages et endpoints dédiés ; réemploi des garde-fous XLSX et modèle indépendant. | Prévisualisation, doublons, transaction, idempotence, 340 salariés et cas limite du plafond choisi. |
| 6 — invitations et identité sensible | Job durable/RPC associée, adaptation `invitations.ts`, `resend-invitations.ts`, `linking.ts`, endpoints d’activation existants ; demande RH d’email si retenue. | Pas d’envoi avant commit, reprise d’échec, pas de rattachement usurpé, ancien jeton contrôlé. |
| 7 — validation et livraison future | Tests ci-dessous, documentation opérationnelle et recette avec deux responsables ; activation progressive de la capacité. | Gates locaux et CI, puis contrôle de cible/version si publication autorisée ultérieurement. |

Ordre minimal de livraison fonctionnelle : fondations → consultation/création → correction et départ **avec compatibilité paie** → import → invitations autonomes et changements sensibles. Les lots 3 et 4 peuvent être développés séparément mais ne doivent pas être activés séparément si le nom devient éditable. Les demandes non retenues restent indisponibles et clairement expliquées.

## 11. Critères d’acceptation et vérifications futures

1. Deux responsables A1/A2 de l’agence A gèrent le même annuaire et les mêmes imports, avec auteurs distincts. Un responsable B n’accède à aucune ligne, compteur, erreur, rapport ou action de A en modifiant URL, UUID ou corps de requête. Retrait d’agence/désactivation entre revue et confirmation interdit l’action.
2. Un import confirmé crée des salariés sans paie, sans fiche et sans envoi implicite. Rejeu/double clic ne crée ni doublon ni double invitation. Matricules canoniques, Unicode, zéros initiaux, emails normalisés, doublons intra-fichier/base, compte global déjà existant et fichier hostile sont testés.
3. Une création concurrente par paie ou un autre responsable invalide ou requalifie le lot ; aucune fusion silencieuse. Les erreurs bloquantes annulent toutes les mutations métier du lot.
4. Une correction de nom survit à la prochaine publication. Une collision matricule/email est bloquée à l’analyse ET au commit. Anciennes fiches/PDF/exports et relations UUID restent inchangés.
5. Un départ est retrouvable dans les archives, ne supprime pas de fiche, ne renouvelle pas sa rétention et ne coupe pas l’accès d’un autre emploi. L’effet d’accès choisi est visible et testé. Aucun fichier ne réactive automatiquement l’emploi ou un compte désactivé.
6. Un retour réutilise le même UUID et garde l’historique. Une invitation ancienne ne contourne pas le départ ni une désactivation. L’échec d’un fournisseur email laisse un salarié créé et une reprise traçable.
7. Les champs privés, pièces, CNAPS, fonctions de congés et administration restent inaccessibles au responsable par UI, requête directe, RPC, Storage et endpoint de téléchargement. Les droits existants de RH, superadmin, salarié, `team_manager` et `client_viewer` ne régressent pas.
8. Deux éditions simultanées produisent une réussite et un conflit explicite, sans perte de mise à jour. Acteur, agence, motif et révisions sont vérifiables dans l’audit.
9. Un départ/contrat incompatible avec affectations ou remplacements n’efface rien silencieusement et déclenche le parcours RH retenu. Un dossier sans contrat ne reçoit pas de contrat fictif pour passer la validation.

**Unitaires et intégration** : nouveaux tests `src/test/unit/agency-employees.test.ts`, `employee-import.test.ts`, handlers/actions et composants ; compléter `employee-identity.test.ts`, `employee-linking.test.ts`, `invitations.test.ts`, `resend-invitations.test.ts`, `publish.test.ts` et `hr-employees.test.ts`. Tester la liste blanche (champs inattendus rejetés), filtres d’agence, concurrence, idempotence et reprise des jobs.

**SQL/RLS** : ajouter `scripts/tests/agency-employee-management.sql` et `agency-employee-imports.sql` transactionnels avec rollback, plus une suite de courses multi-connexions si nécessaire. Matrice rôles/agences/acteurs actifs et inactifs, ancien JWT après désactivation, grants DML/EXECUTE, acteur forgé, FK croisées, lectures privées, révisions, publication concurrente, absence de suppression et rétention. Tester chaque RPC directement avec `anon`, `authenticated` et le chemin `service_role` réel : les tests serveur seuls ne prouvent pas la RLS. Ajouter les suites au job SQL de `.github/workflows/ci.yml`.

**E2E local** : `tests/e2e/agency-employees.spec.ts` et `agency-employee-imports.spec.ts` à créer ; deux responsables A, un B, un salarié ayant deux emplois et un RH. Utiliser un vrai XLSX et parcourir création → revue → confirmation → modification → paie → départ → accès historique → retour RH. Exécuter les régressions `hr-employee-records.spec.ts`, `hr-payroll-identity.spec.ts`, `employee-activation.spec.ts`, `invitation-security.spec.ts`, `native-payroll.spec.ts`, `hr-planning.spec.ts`, `hr-documents.spec.ts` et parcours paie pertinents. Vérifier responsive/clavier et erreurs réseau sans double soumission.

**Exécution lors du développement** : consulter les guides pertinents dans `node_modules/next/dist/docs/` avant d’écrire le code Next.js. Utiliser seulement Supabase local `salary-platform` (ports 55421/55422), clés issues de `supabase status`, jamais celles de production. Un seul opérateur possède reset/mutations/services E2E. Après `npm run db:reset:local`, lancer toutes les suites SQL de `.github/workflows/ci.yml`, puis les nouvelles. `npm run verify:ci` et `npm run verify:full` selon AGENTS.md ; ne pas présenter `verify:full` seul comme couvrant les scripts SQL séparés. Conserver rapports et preuves sans données personnelles. Aucun de ces tests d’implémentation n’a été exécuté pour ce plan.

## 12. Décisions validées et conséquences pour la V1

Les décisions suivantes ont été présentées une par une puis explicitement validées par le propriétaire dans cette conversation. Elles remplacent les options ouvertes correspondantes dans les sections précédentes.

| N° | Décision validée | Conséquences concrètes |
| --- | --- | --- |
| 1 | Le responsable crée avec matricule, nom complet et email ; il modifie nom, poste, département, site et équipe dans sa propre agence. | Références existantes et autorisées uniquement ; aucune création de référentiel. Coordonnées privées, CNAPS, documents, contrats en écriture, rôles et transfert restent hors de ses droits. Les affectations datées restent distinctes. |
| 2 | Le dossier salarié fait référence pour le nom. | Aucun écrasement automatique par paie ou provisioning ; divergence signalée à la prévisualisation. Le nom du snapshot de fiche provient de la source de paie validée ; anciennes fiches inchangées. |
| 3 | Création minimale avec matricule, nom complet et email. | Poste, organisation et contrat ne bloquent pas la création. Mention « Dossier RH à compléter », aucune donnée fictive ; fonctions nécessitant un dossier complet indisponibles jusqu’à complétion. |
| 4 | Le responsable enregistre les départs ; RH intervient uniquement en cas de conflit. | Date effective et motif obligatoires. Conflits d’affectations, remplacements ou autres éléments RH résolus avant confirmation ; aucun contrat, congé ou remplacement modifié automatiquement. Le salarié passe dans les archives. |
| 5 | Maintien de l’accès après départ ; désactivation réservée aux RH. | Consultation des fiches encore disponibles selon leur rétention ; aucune remise en activité implicite. Une désactivation vise l’emploi concerné, sans couper les autres emplois du même compte. |
| 6 | Départs datés du jour ou du passé uniquement en V1. | Archivage dès confirmation, date réelle conservée. Aucune programmation future ; contrôle des conflits pour les départs rétroactifs. |
| 7 | Le responsable demande le retour ; RH le valide. | Même UUID et dossier, historique conservé. Réactivation d’accès distincte ; aucun retour automatique par import. |
| 8 | Publication de fiches après départ autorisée avec validation RH spécifique. | Lignes concernées signalées ; autorisation RH nécessaire avant publication. Ni réactivation de l’emploi ni réactivation de l’accès. Salarié avec accès maintenu : consultation de la fiche selon la rétention habituelle. |
| 9 | Import limité à la création en V1. | Existants identiques ignorés ; différences à résoudre depuis la fiche ou lignes à retirer. Aucun salarié archivé recréé/réactivé, aucun archivage par absence du fichier. |
| 10 | Confirmation tout ou rien sur les lignes retenues. | Aucune création tant qu’une erreur bloquante subsiste. Exclusion explicite possible avant nouvelle prévisualisation. Changements concurrents : nouvelle vérification, pas de succès partiel silencieux. |
| 11 | Invitations hors paie envoyées explicitement par le responsable après création. | Envoi individuel ou sur sélection, destinataires confirmés ; activation possible avant toute fiche. Échec d’envoi récupérable sans suppression du dossier ; pas de nouvelle invitation d’activation pour un salarié ayant déjà accès. Notifications de paie inchangées. |
| 12 | Demande RH depuis la fiche pour correction de matricule ou d’email. | Nouvelle valeur et motif ; ancienne valeur effective jusqu’à réalisation. Contrôle des collisions et conséquences Auth/invitations/imports ; nouvelle adresse de connexion vérifiée avant activation. Suivi en attente/acceptée/refusée, sans fusion automatique. |
| 13 | Lecture seule du type de contrat et de ses dates par le responsable. | Aucune modification, prolongation ni consultation du document signé. Données manquantes indiquées « À compléter par les RH ». |
| 14 | Lecture du Manager RH et demande de changement depuis la fiche. | Seules les RH modifient ce rattachement après vérification de l’éligibilité et des périmètres ; aucun octroi de rôle ou accès implicite. |
| 15 | Fichier source supprimé après traitement ; prévisualisations, rapports et erreurs conservés au maximum 30 jours. | Après expiration, rechargement nécessaire. Dossiers créés conservés ; trace minimale d’opération dans l’audit sans copie du fichier. |
| 16 | Traces minimales d’audit de l’extension conservées 12 mois à compter de chaque action, puis supprimées automatiquement. | Auteur, date, action et résultat consultables selon les droits ; aucun jeton/fichier ni copie systématique des données personnelles. Ne pas étendre cette règle aux autres audits sans examiner leur politique propre. |
| 17 | Archivage des dossiers sans suppression automatique en V1. | Dossier et épisodes d’emploi retrouvables ; aucune suppression définitive par le responsable. Suppression éventuelle réservée aux RH après examen. Durée définitive des dossiers RH à fixer avant automatisation de leur purge ; décision provisoire, pas une conservation illimitée validée. |
| 18 | Transferts réservés aux RH, sans transfert automatique dans cette extension. | Demande par le canal habituel ; pas de changement d’agence par le responsable, pas de déplacement des anciennes fiches ni d’accès automatique à l’historique de l’agence d’origine. Préserver le compte sans duplication lors du traitement RH. |

### Compléments nécessaires à la conception technique

- Prévoir les demandes RH persistées et suivies pour retour, identité et changement de Manager RH : auteur, emploi/agence, objet, valeur demandée autorisée, motif, révision, décision RH et état d’exécution. Une approbation ne doit pas annoncer comme effectué un changement Auth encore en échec. Pas d’élargissement du module général de demandes RH par défaut.
- La validation RH d’une paie après départ doit porter sur les lignes et la version précises revues. Toute correction pertinente, changement de lifecycle ou de contenu invalide cette autorisation ; le responsable conserve son rôle actuel de publication après validation.
- Compléter les migrations/jobs de rétention pour les imports salariés (30 jours maximum) et l’audit de cette extension (12 mois après action), sans modifier la rétention des fiches ni purger les dossiers RH. Les brouillons et données de lignes suivent aussi la limite des imports ; aucune copie persistante ne contourne l’expiration. Définir précisément les échéances et tester leur limite et l’idempotence de purge.
- Le parcours de création minimale et l’édition ultérieure de poste/organisation doivent fonctionner sans contrat obligatoire. Adapter le stockage ou prévoir une couche de complétion partielle sans fabriquer de contrat ni relâcher les invariants des dossiers RH complets existants.
- Ajouter aux critères d’acceptation : consultation seule des contrats, suivi des trois types de demandes, refus des dates futures, publication après départ conditionnée par validation RH, expiration des rapports/erreurs et purge de l’audit aux durées validées, préservation des dossiers et historiques d’agence.

### Point volontairement reporté et limites

La durée définitive de conservation des dossiers RH et des épisodes d’emploi reste à fixer **avant d’automatiser leur purge**. Ce point n’annule pas le choix explicite d’une V1 sans suppression automatique des dossiers. Les modalités techniques détaillées (schéma des demandes, stockage partiel, limites de fichier, messages et index) restent des choix de réalisation à résoudre dans ce périmètre, sans rouvrir les 18 arbitrages validés.

Risques techniques prioritaires : service_role sans contrôle d’agence, projection excessive du dossier RH, coexistence des anciens/nouveaux statuts, comptes multi-agences, conflit paie/identité, concurrence entre responsables, opérations Auth/DB/email non atomiques et reprises de migration ambiguës. Les tests du plan restent à exécuter lors de l’implémentation ; aucune validation fonctionnelle n’est revendiquée à ce stade.

## 13. Livraison future et état de ce document

L’implémentation et la publication feront l’objet d’une demande distincte. Avant une future écriture externe, revérifier dépôt, projet Vercel et référence Supabase : les identifiants d’AGENTS.md ne remplacent pas ce contrôle. Préserver les modifications d’autres tâches, vérifier les gates et journaliser les migrations sur la bonne cible. Aucune preview Vercel sans demande explicite ; avant tout push susceptible d’en déclencher une, vérifier `previewDeploymentsDisabled` et les workflows concernés. Les sauvegardes restent reportées selon la décision existante.

Lors d’une livraison autorisée, distinguer état local, GitHub, migrations et commit réellement promu ; vérifier les parcours essentiels sans tests E2E destructifs en production, nettoyer les fixtures autorisées et révoquer leurs sessions. Pour cette tâche, seul le présent plan a été ajouté et contrôlé par lecture croisée des sources : **rien n’est implémenté ni déployé**.
