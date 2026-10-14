# Intégration RH SMILEBOX–Airtel : preuves locales du 14 octobre 2026

Périmètre : lots 1 à 8 du plan `docs/superpowers/plans/2026-10-14-smilebox-rh-integration.md`. **Rien n'a été déployé** : aucune migration n'est appliquée à Supabase production, aucun push, aucune PR, aucune preview Vercel.

## Correspondances avec les données existantes

| Référence SMILEBOX | Application |
| --- | --- |
| `employees.id` (UUID affiché « Matricule ») | `public.employees.id` ; le matricule affiché est `employees.employee_id`, unique par agence. La paie et la RH partagent la même ligne, sans aucun rapprochement par nom ou email. |
| `employees` (dossier) | `employee_hr_records` (opérationnel) + `employee_private_details` (coordonnées privées, CNAPS) |
| `leaveBalance` | `leave_balances` + journal `leave_balance_movements` (module RH, source unique du solde) |
| `memberships` | `profiles` + `hr_scopes` ; rôles `team_manager` (manager) et `client_viewer` (Airtel) |
| `site`, `department`, `manager` (texte) | `hr_sites`, `hr_departments`, `hr_teams`, `manager_profile_id` |
| `documents` + R2 | `employee_documents` + bucket Storage privé `hr-documents` |
| `requests`, `assignments`, `replacements`, `audit` | `hr_requests`, `hr_assignments`, `hr_replacements`, `audit_logs` |
| Identité Sites, `operations`, `rateLimits`, `reportConfig` | Non repris : session Supabase, transactions PostgreSQL et protections existantes |

## Migrations (ordre d'application)

`20261014090000_hr_roles.sql`, `20261014090100_hr_foundations.sql`, `20261014120000_hr_employee_records.sql`, `20261014150000_hr_employee_documents.sql`, `20261014170000_hr_leaves.sql`, `20261014190000_hr_assignments_replacements.sql`, `20261014210000_hr_requests.sql`, `20261014230000_hr_reporting.sql`.

La première migration ajoute seulement deux valeurs à l'enum `app_role`. Elle doit être validée avant les suivantes, d'où un fichier séparé. Le bucket `hr-documents` et l'extension `btree_gist` sont créés par migration.

## Vérifications locales

| Contrôle | Résultat |
| --- | --- |
| `supabase db reset --local` puis les 10 suites SQL de `.github/workflows/ci.yml` (3 suites paie et 7 suites RH) | Toutes réussies (ROLLBACK, aucune fixture conservée) |
| `scripts/tests/hr-leave-concurrency.sh` (deux sessions PostgreSQL réellement simultanées) | Même congé approuvé deux fois : une décision, un débit. Deux congés qui se disputent un solde : un seul approuvé, solde jamais négatif. |
| `npm run verify:full` | Secrets OK (254 fichiers), lint 0 erreur (2 avertissements préexistants), typage OK, **516 tests unitaires** (55 fichiers), build OK, **64 parcours E2E** (ordinateur et mobile), audit npm : 0 vulnérabilité |
| `npm run db:advisors` | Aucun résultat, après fusion d'une politique `agencies` en double ; parcours dépendants relancés avec succès |
| Captures ordinateur et mobile | Organisation, accès, collaborateurs, fiche, congés, planning, tableau de bord, navigation « Plus » |

Points couverts par les tests : propriété des dossiers et documents, intersections de périmètre manager et client, absence de colonnes privées dans les réponses, révocation et désactivation effectives sur une session ouverte, révisions périmées (409), rollback complet quand l'audit échoue, solde jamais négatif, chevauchements de congés, d'affectations et de remplacements, signature binaire des fichiers, accès direct aux API (401, 403, 404), non-régression de la paie et des bulletins (seul le salarié destinataire les voit).

## Prérequis avant production

1. Vérifier `previewDeploymentsDisabled`, puis ouvrir la PR et attendre le Quality Gate et l'E2E Gate.
2. Appliquer les 8 migrations dans l'ordre sur `fqdquhhuvdrsreukfwai` et les journaliser.
3. Créer `CRON_SECRET` (au moins 32 caractères) dans Vercel. Sans cette variable, la route des alertes refuse tous les appels.
4. Confirmer l'activation de Resend Pro avant d'abonner des destinataires.
5. Après le déploiement, vérifier le commit promu et les parcours par rôle avec des comptes de test, puis supprimer ces comptes.
