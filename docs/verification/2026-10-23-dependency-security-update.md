# Correctifs de dépendances — 23 octobre 2026

Correction locale des quatre vulnérabilités npm relevées à la fin de l’implémentation des workflows salariés. Deux sous-agents GPT-6.1 Sol, raisonnement moyen, ont contrôlé les versions et leur compatibilité en lecture seule ; l’orchestrateur a effectué les modifications et les vérifications.

## Modifications

| Paquet | Avant | Après |
| --- | --- | --- |
| next et eslint-config-next | 16.3.8 | 16.4.2 |
| @sentry/nextjs | 10.62.0 | 10.76.2 |
| vitest | 4.1.11 | 4.1.12 |

Le verrouillage npm est régénéré. L’override du plugin ESLint Next et sa documentation suivent la version 16.4.2 ; l’adaptateur local reste utilisé. `sharp` est verrouillé en 0.35.5. L’import de `withSentryConfig` utilise désormais l’export officiel `@sentry/nextjs/config`, sans changement des options Sentry.

Avis de référence : Next [cache](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [images SVG](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) ; Sentry [tunnel](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55) ; Vitest [mocks](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8), [chemins Windows](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp).

## Vérifications locales

Runtime : Node 24.19.0, correspondant à la version majeure de production. Installation reproductible par `npm ci --ignore-scripts`, puis `npm ls --all` réussi. Aucun script de cycle d’installation exécuté.

`npm run verify:ci` réussi après cette réinstallation et la modification de l’import Sentry : scan de secrets, ESLint, TypeScript, 606 tests dans 67 fichiers, build Turbopack par défaut et audit npm. Audit final : **zéro vulnérabilité**. Aucun upload Sentry ; le build de recette utilise exclusivement les URL et clés Supabase locales.

Deux avertissements ESLint préexistants subsistent sur `window.location.assign` dans les imports de paie. Vite avertit d’un changement futur du chargement de configuration ; la version actuelle exécute les tests avec succès. Ces avertissements ne sont pas des vulnérabilités identifiées par l’audit.

Recette navigateur finale : **88 tests réussis** (44 desktop et 44 mobile, 4 min 18 s) sur le build Turbopack compilé et immuable. Les **deux variantes du parcours de documents privés** réussissent séparément en développement Webpack (54 s), où le stockage HTTP local est autorisé. La CSP de production reste inchangée. Total : **90 variantes réussies**. Les emails sont simulés en local ; aucun envoi externe.

Advisors Supabase locaux réussis. Contrôle SQL final : zéro agence `Codex`, zéro utilisateur Auth `codex-…@example.com`, zéro import salarié, preuve email ou job d’invitation restant. Le fichier généré `next-env.d.ts`, modifié automatiquement par le serveur de développement, est rétabli à son contenu initial.

Scan complémentaire des fichiers suivis et non suivis non ignorés réussi ; `git diff --check` réussi. Les journaux locaux de cette passe sont dans `/private/tmp/salary-dependency-verify-final.log`, `/private/tmp/salary-dependency-e2e.log`, `/private/tmp/salary-dependency-documents.log` et `/private/tmp/salary-dependency-advisors.log`.

## Portée

Les modifications fonctionnelles des workflows déjà présentes sont conservées. Aucun commit, push, preview, déploiement ou changement de base distante. Les migrations et suites SQL restent celles vérifiées dans le [rapport fonctionnel](2026-10-23-agency-employees-implementation.md) ; elles ne sont pas modifiées par cette correction de dépendances.

## Suivi de la PR

Après autorisation distincte, la [PR #25](https://github.com/heritianaratsimbazafy99-hue/salary/pull/25) regroupe les workflows et ces correctifs. Le premier Quality Gate passe sous Node 22. Le premier E2E Gate révèle une dépendance de test à `rg`, absent du runner Ubuntu : les deux recherches du script de concurrence sont remplacées par `grep`, avec `-E` pour préserver la regex du SQLSTATE. Les quatre courses sont revérifiées localement avant le nouveau push. Les résultats définitifs des gates sont attachés au dernier commit dans la PR. Les previews Vercel restent désactivées ; aucune migration distante ni mise en production n’est effectuée.
