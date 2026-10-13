# Bilan avant ouverture aux salariés — 13 octobre 2026

> État historique avant les travaux de fermeture. Le propriétaire a ensuite reporté explicitement les sauvegardes, fixé la rétention à un an et confié support/alertes à son email. Les constats ci-dessous décrivent la release d6e21098, pas les corrections en cours. Voir les migrations et le runbook actualisés pour les décisions courantes.

## Décision proposée

Le parcours principal est implémenté, déployé et vérifié. L’ouverture autonome à tous les salariés n’est pas encore validée. Préparer un pilote limité après fermeture des prérequis opérationnels et des points de sécurité/usabilité ci-dessous, puis généraliser après recette métier.

Ce bilan croise le code actuel, l’historique Git, les documents de conception et les preuves de livraison, avec deux revues indépendantes. Il ne constitue pas un nouvel audit de sécurité exhaustif ni une nouvelle recette de toutes les interfaces de production. Aucune configuration externe n’a été modifiée pour ce bilan.

## Terminé et vérifié

- Production sur d6e21098, PR17 fusionnée, migration20261013073709 appliquée et droits contrôlés. Local main et origin/main alignés.
- Import Excel, mapping, publication, invitation, renvoi, activation, bulletin courant, CSV salarié et reconnexion : parcours réel avec données fictives isolées et quatre emails reçus dans Gmail.
- Vérification des refus : mauvaise adresse, ancien lien, réutilisation, autre navigateur et accès manager pour le salarié.
- 312 tests unitaires et 40 E2E locaux réussis ; CI PR et main réussies ; audit npm à zéro vulnérabilité connue lors de la livraison.
- Rôles, périmètres agence, RLS, imports protégés, CSV neutralisant les formules, journal d’audit et filtrage des secrets dans Sentry implémentés et couverts par les vérifications existantes.
- Création d’agences et de responsables, analytics RH, journal d’audit et API d’exports CSV implémentés ; le parcours RH a une preuve locale, sans nouvelle recette RH en production dans le dossier de cette livraison.
- Health de production relu le 13 octobre à09:17:11UTC : appok, supabaseok, emailconfigured.
- Tests réels nettoyés, sessions révoquées, contrôle indépendant de19 filtres DB àzéro et des deux utilisateurs Auth supprimés.

Preuves : `test-results/production-release-20261013/rapport.md`, `journey.json`, `email-delivery.json`, `cleanup-independent.json`, `deployment.json` ; `tests/e2e/authenticated-payroll.spec.ts`.

## À solder avant de charger de vraies paies

1. **Sauvegardes restaurables.** Lors de la dernière visite du tableau de bord Supabase de ce projet, le résumé indiquait « No backups ». Aucun compte rendu de restauration retrouvé dans les preuves examinées. Vérifier/activer une sauvegarde adaptée, identifier l’opérateur et la rétention, puis réussir une restauration hors production. Une restauration locale depuis les migrations n’est pas une restauration de sauvegarde. Référence : `docs/operations/supabase-backup-restore.md:7,33`.
2. **Déconnexion accessible.** Aucun bouton ou handler de déconnexion trouvé dans `src` ; le shell expose seulement logo et navigation (`src/components/shell/AppShell.tsx`). Ajouter une déconnexion explicite et la tester, particulièrement pour les appareils partagés. La révocation par notre script de test ne fournit pas cette fonction aux utilisateurs.
3. **Contrôle préalable de la publication et des destinataires.** Le composant `InvitationConfirmation` n’est pas raccordé ; `PublishImportButton.tsx:25` publie directement. Rendre les destinataires et la conséquence de publication vérifiables avant la première vraie diffusion. Le chargement de prévisualisation s’arrête à100 lignes sans pagination (`src/app/manager/imports/[importId]/page.tsx:311`) : corriger avant tout lot dépassant100 personnes.
4. **Exploitation et alertes.** Sentry est intégré et configuré ; réception d’un événement et fonctionnement d’une alerte non établis par les preuves examinées. Effectuer ce contrôle, nommer le destinataire des alertes et le responsable d’incident. `/api/health` ne contrôle pas Sentry. Aucune preview n’est requise ou autorisée par ce bilan.
5. **Recette métier et comptes réels.** Confirmer les agences et rattachements RH/managers, tester leurs connexions et réaliser une recette RH sur fichiers représentatifs anonymisés : montants, rubriques, erreurs mixtes, republication, plusieurs mois et effectif cible. Les tests techniques n’attestent pas la conformité de tous les fichiers réels de l’entreprise.

## Fonctions incomplètes à traiter avant généralisation

| Fonction | État constaté | Suite proposée |
| --- | --- | --- |
| Historique salarié | Seul payslips[0] a une vue détaillée ; les anciennes périodes listent date/net sans ouverture du bulletin. | Permettre de sélectionner et consulter chaque période (`src/app/employee/payslips/page.tsx:46,69`). |
| Correction avant publication | Helper testé, sans appel de production ni formulaire de sauvegarde. | Raccorder le parcours prévu ou acter explicitement le processus de correction dans Excel puis nouvel import (`src/lib/payroll/adjustments.ts:8`). |
| Administration courante | Création disponible ; interfaces d’édition/désactivation/réaffectation non présentes. | Fournir les opérations nécessaires et une procédure de retrait d’accès (`src/app/hr/agencies/page.tsx`, `src/app/hr/users/page.tsx`). |
| Exports manager/RH | API CSV implémentée et testée, aucun contrôle d’export dans ces pages. XLSX non implémenté malgré mention dans la conception. | Raccorder les téléchargements et décider du besoin XLSX (`src/app/api/exports/route.ts`, `tests/e2e/authenticated-payroll.spec.ts:70`). |

## Améliorations et exclusions

- Traduire le mail de connexion ordinaire encore intitulé « Your sign-in link » ; harmoniser les accents et instructions.
- Fournir un modèle Excel et un guide court d’utilisation ; fixer le contact support.
- Compléter la recette sur un vrai téléphone, Safari et une boîte email représentative des salariés. Le test réel de livraison couvre Gmail et Chromium mobile émulé.
- Confirmer la volumétrie ; les tests actuels ne prouvent pas une ouverture à effectif illimité.
- Mettre à jour les anciens rapports mentionnant migrations non appliquées, anciens nombres de tests ou vulnérabilités restantes ; ils décrivent des états historiques dépassés.
- PDF, impression soignée, archivage/purge automatisés et traitements asynchrones avancés sont explicitement post-MVP dans la conception. La politique de conservation et les responsabilités doivent néanmoins être fixées pour les données réelles.
- Le produit diffuse des fiches internes issues d’une paie déjà validée. Le calcul réglementaire de la paie et les bulletins légaux officiels ne font pas partie du MVP (`docs/superpowers/specs/2026-06-26-payroll-platform-design.md:7`).

## Ordre recommandé

Sauvegarde/restauration → déconnexion et contrôle publication → alertes et comptes exploitants → recette RH → petit pilote accompagné → interfaces restantes et validation multi-mois → ouverture générale.

Aucun pourcentage d’achèvement global n’est proposé : il confondrait les preuves techniques solides avec les décisions et parcours métier encore ouverts.
