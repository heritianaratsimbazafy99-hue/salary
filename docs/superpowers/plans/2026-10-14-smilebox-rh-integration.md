# Intégration des fonctions RH SMILEBOX–Airtel — analyse et plan

> Statut : décisions D1–D7 et périmètre §9 validés par le propriétaire le 14/10/2026. Lots 1 à 8 implémentés et vérifiés en local (non déployés). Référence analysée : `~/Documents/Codex/2026-10-12/por/outputs/smilebox-airtel-transfert-claude` (bêta, données fictives). Cible : ce dépôt au commit `bc5a1bf`.

## 1. Verdict

**Faisable, sans réécrire la paie.** Les deux applications sont complémentaires :

- La référence apporte un domaine RH absent chez nous (dossiers, contrats, congés, affectations, remplacements, demandes, CNAPS, documents privés), mais elle ne gère ni l'import Excel, ni le PDF, ni la diffusion des bulletins.
- Notre plateforme possède déjà l'import Excel validé, la revue manager, la publication versionnée, le PDF à la demande, les invitations et l'audit. Elle n'a aucun module RH.

Le cœur métier de la référence est petit : environ 140 lignes de service dense, 11 tables et 15 actions. On ne copiera que les **règles**. Le code sera réécrit pour notre stack, car rien d'autre que les types et les schémas Zod n'est réutilisable tel quel : Worker et D1/SQLite, identité injectée par Sites, `Portal.tsx` monolithique et filtrage des colonnes côté applicatif.

Estimation : 8 lots livrables séparément, chacun derrière les gates existants (Quality Gate et E2E Gate).

## 2. Comparaison des stacks

| Sujet | Référence SMILEBOX | Notre application | Conséquence |
| --- | --- | --- | --- |
| Framework | Vinext/Vite, Worker Cloudflare | Next.js 16 App Router, Vercel Node 24 | Server components et server actions ; pas de `/api/state` monolithique |
| Base | D1 (SQLite), batch = transaction | Supabase Postgres + RLS + RPC `security definer` | Les gardes `operations` deviennent des fonctions PL/pgSQL transactionnelles avec `FOR UPDATE` et un contrôle de `revision` |
| Fichiers | R2 privé | Aucun stockage aujourd'hui : PDF générés à la volée par `pdf-lib` | Nouveau bucket Supabase Storage privé, réservé aux documents RH |
| Identité | En-têtes Sites et table `memberships` (email → userId) | Supabase Auth (lien magique), `profiles.auth_user_id`, `getClaims()` | `memberships` et les en-têtes Sites disparaissent ; l'identité vient uniquement de la session Supabase |
| Rôles | admin, rh, manager, employee, airtel | super_admin, hr_central, agency_manager, employee | Correspondance en §3.2 ; deux rôles à ajouter |
| Organisation | Mono-prestation ; site et département en texte libre | `agencies` (Airtel, Huawei) avec FK composites `(id, agency_id)` | `agency_id` sur toutes les nouvelles tables ; sites, départements et équipes deviennent des référentiels |
| Audit | Table `audit` (texte libre) | `audit_logs` (action, resource_type, metadata, agency_id, employee_id) | On réutilise `audit_logs` |
| Limites de requêtes | Table `rateLimits` | Limites de Supabase Auth ; contrôle d'origine natif des server actions | On ne recrée pas `rateLimits` ; on borne la taille côté route d'upload |
| UI | shadcn/Tailwind, `Portal.tsx` | `AppShell`, `RoleNav`, `Surface`, `Table`, `StatusBadge`, `Charts`, Tailwind 4 | `Portal.tsx` sert seulement de maquette fonctionnelle |

## 3. Correspondances de données

### 3.1 Entités

| Référence | Cible | Décision |
| --- | --- | --- |
| `employees.id` (UUID affiché « Matricule ») | `public.employees.id` (UUID) | Les FK RH pointent sur `employees.id`. **Le matricule affiché devient `employees.employee_id`** (texte, unique par agence). Aucun rapprochement par nom ou email. |
| `employees` (poste, contrat, statut…) | Nouvelle table `employee_hr_records` (1:1, `employee_id` + `agency_id`, `revision`) | Données opérationnelles visibles du manager et du client selon leur périmètre |
| `employees.email/phone` (contacts privés), `cnapsNumber/Status` | Nouvelle table `employee_private_details` | RLS limitée à RH/admin et au salarié ; le manager et le client n'y accèdent jamais. Postgres filtre par ligne et non par colonne : une table séparée est donc nécessaire. |
| `employees.leaveBalance` | `leave_balance_movements` (journal) + vue de solde | Un débit unique par congé : `unique (leave_request_id, kind)` |
| `site`, `department` (texte) | `hr_sites`, `hr_departments`, `hr_teams` (avec `agency_id`) | FK réelles ; reprise des valeurs libres au moment de la saisie |
| `manager` (texte libre) | `employee_hr_records.manager_profile_id` → `profiles` | Lien vers un compte réel |
| `memberships` | `profiles` + `hr_scopes (profile_id, agency_id, department_id?, site_id?)` | Le rôle reste dans `profiles.role` ; le périmètre RH va dans `hr_scopes` |
| `leaves` | `leave_requests` | Les statuts deviennent un enum Postgres |
| `requests` | `hr_requests` | — |
| `assignments` | `hr_assignments` | Chevauchement interdit par `EXCLUDE USING gist` (`btree_gist`, `daterange`) |
| `replacements` | `hr_replacements` | `unique (leave_request_id)` ; exclusion des chevauchements pour le remplaçant confirmé |
| `documents` + R2 | `employee_documents` + bucket `hr-documents` (chemin `{agency_id}/{employee_id}/{uuid}`) | La clé de stockage n'est jamais envoyée au client |
| `audit` | `audit_logs` | `action` reprend le nom de l'action (`leave.approve`…) |
| `reportConfig` | supprimée | La référence ne connaît que le mode manuel ; les exports passent par le module existant |
| `operations`, `rateLimits` | supprimées | Remplacées par la transaction Postgres et les protections existantes |

### 3.2 Rôles

| Référence | Cible | Droits |
| --- | --- | --- |
| admin | `super_admin` | Tout, y compris l'administration des accès |
| rh | `hr_central` | Gestion RH complète, sans administration des comptes. **Lecture de toutes les agences, comme aujourd'hui** (à confirmer, D2) |
| manager | **nouveau** `team_manager` | Départements et sites attribués dans une agence ; décisions sur congés, affectations et remplacements ; pas de documents, bulletins, contacts privés, CNAPS ni demandes RH |
| employee | `employee` | Son dossier, ses documents, ses bulletins, ses congés et ses demandes |
| airtel | **nouveau** `client_viewer` | Lecture opérationnelle des sites attribués : effectifs, affectations, remplacements, indicateurs, CSV. Rien d'autre. |
| — | `agency_manager` (existant) | Inchangé : import et publication de la paie de son agence. Aucun droit RH par défaut (D1). |

On ajoute deux valeurs à l'enum `app_role`, sans en modifier les valeurs existantes. Les fonctions `private.current_*` sont étendues ou complétées par `private.hr_scope_allows(employee_id)`.

## 4. Raccordement à la paie

| Point | Constat | Décision proposée |
| --- | --- | --- |
| Calcul de paie | Notre application ne calcule pas : elle diffuse une paie déjà validée (Excel) | Aucune modification des règles d'import et de publication |
| Import Excel, PDF, distribution par lot | **Déjà présents chez nous** (`src/lib/payroll/*`, `src/lib/payslips/pdf.ts`, invitations par lots de 100) | On réutilise l'existant ; la référence n'apporte rien sur ce sujet |
| Bulletins dans « Documents » | Les bulletins sont des `payslips` + `payslip_versions`, rendus en PDF à la demande | L'onglet Documents liste les bulletins publiés (lien salarié, période, version) et les télécharge par la route existante `/api/employee/payslips/[id]/pdf`. **Aucune copie dans le stockage.** Le type « Bulletin » à l'upload est réservé aux bulletins antérieurs à la plateforme (D4). |
| Solde de congés | La paie n'en gère pas ; la catégorie `ABSENCE` de l'Excel n'est qu'une rubrique de montant | **Le module RH détient le solde.** La paie reste la source des montants d'absence. |
| Transmission des absences | Aucun flux aujourd'hui | Pas de push automatique. Option : export CSV des congés approuvés par période, à envoyer au prestataire de paie, idempotent par `(leave_request_id, période)` (D5) |
| Rattachement des salariés | L'import crée ou rattache les `employees` par `(agency_id, employee_id)` | Un dossier RH se crée sur la même ligne `employees`. Il faut fixer la règle de création (D3). |
| Rétention | Bulletins conservés un an (décision du 13/10) | Les documents RH (contrats…) nécessitent leur propre durée de conservation (D6) |

## 5. Sécurité et fiabilité

- Toutes les écritures RH passent par des RPC `security definer` (`hr_*`). Chaque RPC relit le profil courant (actif, rôle, périmètre) **dans la transaction** avec `for share`, contrôle la `revision`, verrouille les lignes concernées (`for update`) et écrit l'audit dans la même transaction. Ce modèle reprend celui de `publish_payroll_import_reviewed` et `admin_save_manager`.
- `leave.approve` = statut + débit du journal + remplacement éventuel + audit, en une seule transaction. Une erreur à n'importe quelle étape annule le tout. Le débit unique est garanti par une contrainte d'unicité, et pas seulement par le code.
- Les lectures passent par la RLS. Pour le manager et le client, on expose des vues ou RPC opérationnelles sans colonnes privées.
- Upload : route `/api/hr/documents` (espace de noms dédié, pas de `/api/session`), taille ≤ 10 Mio, contrôle de la signature binaire (PDF, PNG, JPEG) sur le modèle de `xlsx-guard.ts`, réservé à RH/admin.
- Téléchargement : contrôle serveur (propriétaire, ou RH/admin, dans l'agence), puis flux privé ou URL signée courte, `Cache-Control: no-store`. Le manager et le client reçoivent toujours 403/404.
- Les en-têtes `x-sites-*` et `BOOTSTRAP_ADMIN_EMAIL` ne sont pas repris. `.openai/hosting.json` et `source/AGENTS.md` ne sont pas copiés.
- Sentry : aucune donnée de dossier ni nom de fichier dans les événements (même règle que `sentry-auth-privacy.test.ts`).

## 6. Lots de mise en œuvre

Chaque lot comprend sa migration, ses tests SQL, ses tests unitaires et E2E, puis passe `npm run verify:full` en local avant la PR.

### Lot 0 — Décisions et ADR (½ j)
- [x] Décisions D1 à D7 validées le 14/10/2026 (propositions par défaut ; D6 reste ouverte : aucune purge automatique des documents RH).
- [x] Correspondances consignées dans ce document.

### Lot 1 — Fondations (2–3 j)
- [x] Migrations `20261014090000_hr_roles.sql` (enum `app_role` + `team_manager`, `client_viewer`) et `20261014090100_hr_foundations.sql` (`hr_sites`, `hr_departments`, `hr_teams`, `hr_scopes`, helpers `private.hr_*`, RPC `hr_save_*`, `admin_save_hr_access`, `admin_set_hr_access_active`). `btree_gist` est reporté au lot 5, où il sert.
- [x] Contraintes : `agency_id` partout, FK composites `(id, agency_id)`, comme dans le schéma existant.
- [x] `src/lib/roles.ts`, `src/lib/admin/permissions.ts`, `src/lib/admin/auth.ts`, `src/lib/hr/*` ; pages `/hr/organisation`, `/hr/access`, `/team`, `/client`.
- [x] `RoleNav` : entrées par rôle. Le regroupement mobile « Plus » est reporté au lot 7, quand le nombre d'entrées l'exigera.
- [x] Suite SQL `scripts/tests/hr-foundations.sql`, ajoutée à `.github/workflows/ci.yml` ; tests unitaires `src/test/unit/hr-access.test.ts` ; E2E `tests/e2e/hr-foundations.spec.ts`.

### Lot 2 — Dossiers, contrats, CNAPS (3 j)
- [x] Migration `20261014120000_hr_employee_records.sql` : `employee_hr_records` (poste, département, site, équipe, responsable, statut, contrat ; FK composites par agence, équipe liée au site) et `employee_private_details` (coordonnées privées, CNAPS), RPC `hr_create_employee`, `hr_save_employee_record`, `hr_save_private_details`, `hr_update_cnaps` (« Déclaré » exige un numéro), et l'annuaire filtré `hr_employee_directory`, qui ne renvoie aucune colonne privée.
- [x] Correspondance : le dossier RH utilise la même ligne `employees` que la paie (`employees.id` et clé `(agency_id, employee_id)`). Le nom et l'email restent ceux de la paie ; l'import ne modifie jamais le dossier RH. L'audit consigne les noms des champs modifiés, jamais leurs valeurs privées.
- [x] Pages `/hr/employees` (filtres, pagination côté base, création, compteur des dossiers à compléter) et `/hr/employees/[id]` (identité, poste et contrat, coordonnées privées, CNAPS) ; `/employee/profile` en lecture seule ; annuaire de périmètre dans `/team` et `/client`.
- [x] Libellé « Suivi administratif CNAPS — ce n'est pas une télé-déclaration ».
- [x] Types de contrat : CDI, CDD, Intérim, Contrat de mission (validés le 14/10/2026). Seul le CDD exige une date de fin ; une mission ou un intérim peut avoir un terme imprécis.
- [x] Tests : `scripts/tests/hr-employee-records.sql` (CI), `src/test/unit/hr-employees.test.ts`, `tests/e2e/hr-employee-records.spec.ts`.

### Lot 3 — Documents privés (2 j)
- [x] Migration `20261014150000_hr_employee_documents.sql` : bucket privé `hr-documents` (10 Mio, PDF/PNG/JPEG, aucune politique d'accès client), table `employee_documents` (catégories Contrat, Pièce administrative, Bulletin antérieur avec mois obligatoire ; états En attente, Disponible, Refusé, Retiré), droits de colonne qui excluent le chemin de stockage, RPC `hr_begin_document_upload`, `hr_complete_document_upload`, `hr_reject_document_upload`, `hr_withdraw_document`.
- [x] Les fonctions Vercel plafonnent les requêtes et réponses à 4,5 Mo. Le fichier va donc directement du navigateur au stockage, grâce à une autorisation d'envoi signée et à usage unique. Le serveur relit ensuite les octets (signature binaire et taille) avant de rendre le document disponible ; un fichier non conforme est supprimé. Le téléchargement contrôle les droits, puis redirige vers un lien signé valable 60 s.
- [x] Fiche RH : dépôt, liste, retrait motivé (sans effacement) ; bulletins publiés affichés en lecture seule (période, version), sans copie. Salarié : « Mes documents » dans `/employee/profile`, avec un lien vers « Mes fiches ».
- [x] Aucune purge automatique (D6 ouverte).
- [x] Tests : `scripts/tests/hr-employee-documents.sql` (CI), `src/test/unit/hr-documents.test.ts`, `tests/e2e/hr-documents.spec.ts`.

### Lot 4 — Congés et absences (3–4 j)
- [x] Migration `20261014170000_hr_leaves.sql` :
  - Tables `leave_balances` (solde jamais négatif, révision), `leave_requests` et `leave_balance_movements` (Solde initial, Correction, Congé approuvé, Recrédit ; un seul mouvement par congé et par nature).
  - Contrainte d'exclusion `btree_gist` : aucun chevauchement de demandes en attente ou approuvées pour un même salarié.
  - Fonction `hr_business_days` (lundi au vendredi), RPC `hr_adjust_leave_balance`, `hr_create_leave`, `hr_decide_leave`, `hr_cancel_leave`, et lecture `hr_list_leaves`, qui masque aux managers le motif du salarié et celui de la décision.
- [x] Le module RH détient les soldes. La paie reste la source des montants, sans transmission automatique ; l'export prévu en D5 viendra au lot 7.
- [x] Approbation = statut + débit + audit dans une seule transaction. Le profil de l'acteur est verrouillé, donc une révocation ou un changement de périmètre simultané est sérialisé. L'annulation d'un congé approuvé (par la RH) recrédite une seule fois.
- [x] Pages `/employee/leaves` (demande, annulation d'une demande en attente, historique du solde), `/team/leaves` (file de décisions du périmètre, sans motifs), `/hr/leaves` (filtres, décisions, annulation motivée) ; panneau Congés dans la fiche RH (solde initial, correction motivée, saisie pour le salarié).
- [x] Tests : `scripts/tests/hr-leaves.sql` et `scripts/tests/hr-leave-concurrency.sh` (deux sessions PostgreSQL réellement simultanées : même congé approuvé deux fois, puis deux congés qui se disputent un solde), tous deux en CI ; `src/test/unit/hr-leaves.test.ts` ; `tests/e2e/hr-leaves.spec.ts`.
- [ ] Non couverts (décision à prendre) : jours fériés malgaches, acquisition automatique, demi-journées, validation à plusieurs niveaux.

### Lot 5 — Affectations et remplacements (3 j)
- [x] Migration `20261014190000_hr_assignments_replacements.sql` :
  - Tables `hr_assignments` (Planifiée, Active, Terminée ; chevauchement interdit par exclusion) et `hr_replacements` (À pourvoir, Confirmé, Annulé ; un seul besoin par congé ; double réservation d'un remplaçant interdite par exclusion).
  - Lecture via `hr_list_assignments`, `hr_list_replacements` et `hr_replacement_candidates`, filtrés par rôle ; le client voit ses sites, sans motif ni type d'absence.
  - RPC `hr_save_assignment`, `hr_confirm_replacement`, `hr_cancel_replacement`.
  - Trigger : un changement de contrat ne peut pas laisser une affectation ou un remplacement hors contrat.
- [x] `hr_decide_leave` accepte `p_replacement_needed` : le besoin est créé dans la même transaction que l'approbation. Annuler un congé annule son remplacement. Un remplaçant confirmé ne peut pas obtenir un congé sur les mêmes jours.
- [x] Pages `/team/planning` et `/hr/planning` (affectations par site, besoins avec remplaçants éligibles calculés par la base) ; case « Créer un besoin de remplacement » à l'approbation ; espace client (affectations actives, remplacements) ; « Mes affectations » dans `/employee/profile`.
- [x] Tests : `scripts/tests/hr-assignments-replacements.sql` (CI), `src/test/unit/hr-planning.test.ts`, `tests/e2e/hr-planning.spec.ts`.

### Lot 6 — Demandes RH (1 j)
- [x] Migration `20261014210000_hr_requests.sql` : table `hr_requests` (Contrat, Paie, Congés, Administratif, Autre ; Ouverte, En cours, Résolue ; une réponse courante), lecture limitée à la RH et au salarié concerné, RPC `hr_create_request` (salarié pour lui-même, ou RH) et `hr_reply_request` (RH, révision). L'audit ne consigne que la catégorie et le statut, jamais le contenu.
- [x] Pages `/employee/requests` et `/hr/requests` (filtres, réponse, résolution).
- [x] Tests : `scripts/tests/hr-requests.sql` (CI), `src/test/unit/hr-requests.test.ts`, `tests/e2e/hr-requests.spec.ts`.

### Lot 7 — Tableaux de bord, rapports, espace client, alertes et reporting automatique
- [x] Migration `20261014230000_hr_reporting.sql` :
  - Indicateurs `hr_dashboard` calculés par `private.hr_dashboard_for` : effectif actif, couverture, absentéisme, entrées et sorties, remplacements, délai moyen de confirmation, échéances à 30, 60 et 90 jours, congés en attente ; pour la RH seulement, demandes RH, CNAPS et dossiers à compléter.
  - Périmètre par rôle : le client ne reçoit aucune donnée d'absence ni de congé.
  - Export `hr_export_approved_leaves` (D5, RH seulement).
  - Abonnements `hr_report_subscriptions`, gérés par le super administrateur, et journal `hr_notification_deliveries`, qui empêche les envois en double.
  - Fonction `hr_contract_alerts_due`, aux seuils J-30, J-15 et J-7.
- [x] `/hr/dashboard` (agence, mois, alerte J-7, couverture par site, échéances, exports) ; indicateurs de périmètre dans `/team` et `/client` ; route `/api/hr/reports/[kind]` (CSV effectifs, congés approuvés, remplacements ; formules neutralisées ; export audité).
- [x] Alertes quotidiennes et rapport mensuel par email (Resend) via `/api/cron/hr-notifications`, planifiée dans `vercel.json` (05:00 et le 1er du mois à 06:00 UTC) et protégée par `CRON_SECRET`. Un seul récapitulatif par destinataire, avec clé d'idempotence et journal. L'historique des envois est le journal `hr_notification_deliveries` (et non `export_jobs`).
- [x] Navigation : menus groupés (Ressources humaines, Paie, Administration) sur ordinateur ; barre mobile limitée à 4 destinations avec libellés courts, le reste dans « Plus ».
- [x] Tests : `scripts/tests/hr-reporting.sql` (CI), `src/test/unit/hr-reporting.test.ts`, `tests/e2e/hr-reporting.spec.ts` (envoi réel vers le faux serveur Resend local, sans doublon à la relance).
- [ ] Production : `CRON_SECRET` à créer par le propriétaire dans Vercel ; les alertes consomment le quota Resend (un email par destinataire et par jour au plus).

### Lot 8 — Administration des accès et traçabilité
- [x] Création, modification et révocation des accès `team_manager` et `client_viewer`, avec leurs périmètres : `/hr/access` (lot 1), réservé au super administrateur ; révocation immédiate, y compris pour les sessions ouvertes. Les comptes RH et super administrateur ne sont pas modifiables depuis cette page.
- [x] Destinataires des alertes et rapports mensuels gérés dans `/hr/access` (lot 7).
- [x] `/hr/audit` : filtre Ressources humaines / Paie et accès ; libellés lisibles pour toutes les actions RH. Les métadonnées d'audit ne contiennent jamais de valeur privée (coordonnées, numéro CNAPS, motifs, contenu des demandes).
- [x] Guide `/help` : une section par rôle (salarié, manager RH, client, RH, super administrateur). La section « Publier une paie » n'est plus montrée au manager RH ni au client.

### Lot 9 — Recette et livraison
- [ ] Portage des 34 tests (§8), E2E par rôle, non-régression paie.
- [ ] PR → Quality Gate et E2E Gate → merge → migrations appliquées et journalisées sur `fqdquhhuvdrsreukfwai` → vérification du commit promu et des parcours essentiels → nettoyage des fixtures.
- [ ] Aucune preview Vercel ; vérifier `previewDeploymentsDisabled` avant chaque push.

## 7. Décisions métier à prendre

| # | Question | Proposition par défaut |
| --- | --- | --- |
| D1 | Le responsable d'agence (`agency_manager`) obtient-il aussi les droits de manager RH, ou est-ce un rôle distinct ? | Rôle distinct `team_manager`. Le manager RH ne doit voir aucun bulletin, alors que `agency_manager` voit les montants d'import. |
| D2 | `hr_central` voit-il toutes les agences (Airtel **et** Huawei) ? | Oui, comme aujourd'hui (`is_global_reader`). Sinon, prévoir un périmètre par agence. |
| D3 | Qui crée un salarié : l'import de paie, la RH, ou les deux ? | Les deux, sur la même clé `(agency_id, employee_id)`. La RH peut créer un dossier avant la première paie. L'import ne modifie jamais les champs RH. |
| D4 | Accepte-t-on l'upload de bulletins hors plateforme (historique) ? | Oui, type « Bulletin historique », sans fusion avec `payslips` |
| D5 | Les congés approuvés doivent-ils être transmis au prestataire de paie ? | Export CSV par période, sans intégration automatique |
| D6 | Durée de conservation des contrats et pièces administratives ? | À fixer par le propriétaire. Pas de purge automatique tant que ce n'est pas décidé. |
| D7 | Soldes initiaux : saisie manuelle par la RH, ou import d'un fichier ? | Saisie manuelle et ajustement motivé (la référence ne prévoit pas d'import) |

Points non couverts par la référence ni par ce plan, à décider séparément : acquisition automatique des congés, jours fériés malgaches, validation à plusieurs niveaux, notifications par email des décisions de congé (impact sur le quota Resend), import massif de dossiers, signature de contrat, télédéclaration CNAPS.

## 8. Portage des 34 tests de référence

| Tests de référence | Équivalent cible |
| --- | --- |
| Identité Sites, bootstrap, liaison d'invitation, revendication concurrente (5) | Déjà couverts par les tests d'auth et d'invitation existants ; on ajoute la révocation avec session ouverte pour les nouveaux rôles |
| Origine, limite de corps, erreurs sans détail (3) | Route d'upload : taille, signature, `no-store`, erreurs génériques ; les server actions vérifient l'origine nativement |
| Harnais D1 et rollback de batch (2) | Suite SQL : exception au milieu d'une RPC → aucune ligne modifiée |
| Périmètres employé, manager et client, documents, champs privés (6) | Tests RLS dans `src/test/rls` + suite SQL par rôle |
| Validation des dates, révisions, jours ouvrés (3) | Vitest (Zod) + SQL (`business_days`) |
| Approbations concurrentes, solde partagé, panne intermédiaire, conflits (5) | Tests d'intégration sur Supabase local avec appels RPC parallèles |
| Révocation, rétrogradation, dernier admin, invitation avec périmètre (4) | SQL + E2E administration |
| Remplacement, documents par ID deviné, ajustement de solde, réponses RH (4) | SQL + E2E |
| Format de document (1) | Vitest sur la signature binaire |
| Non-régression paie | Suites actuelles inchangées + E2E : un salarié ne voit que ses bulletins, ni le manager RH ni le client n'y ont accès |

## 9. Périmètre retenu sans cahier des charges Airtel

Aucun cahier des charges Airtel précis n'existe (confirmé le 14/10/2026). Le périmètre ci-dessous s'appuie sur la liste commerciale « Portail RH SMILEBOX – Airtel ». Tout y est paramétrable, pour pouvoir s'adapter à une demande ultérieure d'Airtel sans refonte.

**KPI (tableau de bord RH et espace client)**
- Effectif actif par site et par équipe ; entrées et sorties sur la période.
- Taux de couverture : collaborateurs actifs sous contrat avec une affectation active.
- Taux d'absentéisme : jours d'absence approuvés ÷ jours ouvrés théoriques, par site et par mois.
- Remplacements : nombre de besoins, part pourvue, délai moyen de confirmation.
- Contrats arrivant à échéance sous 30, 60 et 90 jours.
- Pour la RH uniquement : demandes RH ouvertes et délai moyen de résolution, dossiers CNAPS « À déclarer » ou « À régulariser ».
- Le client voit seulement des agrégats et des données opérationnelles de ses sites : aucun motif, aucun solde, aucune donnée personnelle sensible.

**Alertes contrats** (lot 7 bis)
- Échéances à J-30, J-15 et J-7 : bandeau dans l'application et email récapitulatif quotidien aux RH, regroupé en un seul envoi par destinataire pour épargner le quota Resend.
- Tâche planifiée (Vercel Cron) idempotente : une clé par contrat et par seuil évite tout envoi en double.

**Reporting automatique** (lot 7 bis)
- Rapport mensuel (option hebdomadaire) : effectifs, couverture, absentéisme, remplacements et échéances, au format CSV, avec un résumé par email.
- Destinataires configurés par l'administrateur. Un client ne reçoit que ses sites.
- Historique des rapports générés conservé dans `export_jobs`.

Estimation pour le lot 7 bis : 4 à 6 h de travail agent.

## 10. Risques

- **Supabase Free** : 1 Go de stockage et une base limitée. Avec 340 salariés et quelques PDF de 10 Mio maximum chacun, cela suffit au départ, mais il faut surveiller le volume. Les sauvegardes restent reportées (décision du 13/10) : les documents RH déposés n'auraient alors aucune sauvegarde.
- **Navigation mobile** : avec ses nouvelles entrées, la barre du rôle RH dépasse 8 liens ; un regroupement est nécessaire.
- **Taille de la livraison** : il faut livrer lot par lot, sans tout fusionner en une seule PR.
