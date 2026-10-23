# Gestion des salariés par agence — vérification locale du 23 octobre 2026

Périmètre : les 18 décisions validées dans la section 12 du [plan](../superpowers/plans/2026-10-23-agency-manager-employee-lifecycle.md). Règles et limites dans [le guide opérationnel](../operations/agency-employee-management.md), [le contrat SQL](../operations/agency-employees-contract.md) et [la reprise des changements d’email](../operations/employee-email-change.md).

## Livraison

Implémentation locale : annuaire partagé par agence, création minimale, corrections opérationnelles, départs et archives, demandes et décisions RH, import XLSX atomique de créations, invitations explicites avec reprise, validation de paie après départ et changement d’email vérifié. Cinq migrations et les contrôles SQL correspondants sont ajoutés à la CI. Aucun push, commit, déploiement, preview Vercel ou changement distant effectué.

Orchestration et vérification par l’agent principal ; implémentation répartie entre sous-agents GPT-6.1 Sol avec raisonnement moyen, selon la demande. Un seul opérateur a contrôlé les services et mutations de base partagés.

Base initiale : commit `73a2ef1cdd540a6062a887ea5275b294d40c98c9`, aucun fichier suivi modifié au départ ; documents non suivis préexistants conservés. Les tests initiaux étaient à 551 succès. Exécution locale avec Node 26.7.0 ; la cible Vercel reste Node 24 et n’a pas été modifiée.

## Contrôles réussis

- Reset complet du seul projet Supabase local `salary-platform`, API `127.0.0.1:55421`, base `supabase_db_salary-platform`. Les cinq nouvelles migrations ont été chargées ensemble depuis zéro.
- 19 suites SQL/shell de CI réussies. La suite email a été relancée après correction de l’ordre d’une fixture : l’invitation préexistante doit précéder l’approbation de changement d’adresse. Les tests vérifient les rôles réels `service_role`, `authenticated`, `anon`, et pas seulement le rôle administrateur SQL.
- Quatre courses contrôlées sur deux connexions : sauvegarde à révision identique, création individuelle pendant import, publication de paie pendant import, révocation du rattachement pendant import. Les attentes de verrous sont observées ; assertions sur absence de création partielle, absence de doublon et état final.
- 67 fichiers de tests unitaires, 606 tests réussis.
- ESLint sans erreur ; deux avertissements préexistants sur `window.location.assign` dans les composants d’import de paie. Typage TypeScript réussi.
- Build Webpack de production réussi, configuré exclusivement avec les URL et clés Supabase locales pour la recette navigateur. Aucun upload Sentry. Le build Turbopack par défaut échoue sur ce poste au lancement de son processus interne (`Operation not permitted`) ; il n’est pas déclaré validé. Le choix Webpack reste une option explicite pour les tests, sans changement du build par défaut.
- Advisors Supabase locaux : aucun problème signalé.
- Scan de secrets des fichiers suivis et non suivis non ignorés : aucun résultat. `git diff --check` réussi.

## Recette navigateur

Recette finale sur le build compilé et immuable, avec SMTP Auth local et fournisseur Resend simulé sur `127.0.0.1:55428`. Aucun email externe. Les premières passes en développement ont détecté les erreurs d’intégration corrigées ; leurs résultats ne remplacent pas la recette finale.

Sur le build compilé : 44 parcours desktop et 44 parcours mobile validés, après correction et relance ciblée de l’import XLSX mobile. Les assertions vérifient également l’absence de débordement horizontal du formulaire et de la revue ; capture mobile examinée.

Le parcours de documents privés est revérifié séparément en développement : la CSP de production interdit volontairement le stockage HTTP local. La trace confirme une création HTTP 201 puis le blocage navigateur de l’upload signé avant la vérification du fichier ; aucun assouplissement de la CSP de production n’a été ajouté. Résultat de cette relance : deux succès (desktop et mobile). Au total, les 90 variantes de parcours sont validées dans les environnements indiqués.

La recette couvre création sans compte ni email automatique, partage entre responsables de la même agence, isolation inter-agences et dossiers privés, organisation partielle, dates futures refusées, départ et retour séparés des droits, conservation du même salarié, imports sans écrasement ni doublon, sélection/exclusion atomique, invitations explicites et reprise idempotente, approbation RH liée à la version de paie, vérification des deux adresses Auth, preuve dédiée sans compte, ainsi que les parcours existants de paie, exports, documents, congés, planning, demandes et accès.

Les fixtures contrôlées après les suites compilées sont nettoyées : zéro agence de test, zéro utilisateur Auth de test identifié, zéro import salarié, preuve email ou job d’invitation restant.

## Corrections vérifiées pendant l’intégration

- Comparaison CSRF à l’origine publique configurée, indépendante du nom d’hôte interne Next ; refus avant mutation sur les nouveaux endpoints.
- Retours de sauvegarde conservés après revalidation ; sélecteurs navigateur fondés sur les vrais liens et menus.
- Ordre de verrouillage homogène des créations et imports ; révisions et empreintes recontrôlées.
- Toutes les demandes RH actives restent visibles, même au-delà de 500 demandes terminées.
- Accès à Auth via helpers SQL privés minimaux ; aucun droit général de lecture d’`auth.users` accordé au rôle serveur.
- Tentatives Auth indéterminées conservées comme barrière ; aucun remplacement de tentative permettant une annulation dangereuse. Réconciliation RH possible après suspension sans réactivation.
- Notification à l’ancienne adresse bloquée si Auth a déjà confirmé la nouvelle ; invitations bloquées pendant vérification. L’approbation RH de paie affiche agence, période et montants, avec contrôle d’empreinte avant et après lecture.
- Import XLSX mobile : grilles et champ fichier bornés, défilement horizontal limité au tableau, marge de défilement des boutons pour éviter la navigation inférieure.
- Compatibilité du build Next : helper santé extrait du fichier route et signatures de deux pages corrigées.

## Limites et préparation d’une livraison distante

L’audit npm initial du 23 octobre signalait quatre vulnérabilités dans les versions déjà présentes : deux critiques (`next@16.3.8`, `@sentry/nextjs@10.62.0`) et deux modérées (`vitest` / `@vitest/mocker`). Elles ont ensuite été corrigées dans le [chantier dédié aux dépendances](2026-10-23-dependency-security-update.md) : audit à zéro vulnérabilité et `verify:ci` réussi sous Node 24, y compris le build Turbopack par défaut. Les résultats ci-dessus décrivent la recette fonctionnelle initiale ; le rapport dédié consigne la nouvelle vérification. La CI distante n’a pas été lancée.

Avant une mise en production : vérifier les gates et les identités de cibles, appliquer les migrations, vérifier le cron d’invitations et la configuration Auth (double confirmation, SMTP et callback HTTPS autorisé). Aucun de ces réglages distants n’a été modifié ici. Une tentative Auth au résultat indéterminé exige un diagnostic opérateur ; aucun bouton ne force la confirmation d’adresse. La durée définitive de conservation des dossiers archivés reste à décider avant automatisation de leur purge.
