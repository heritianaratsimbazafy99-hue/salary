# Salary / MadajobPay

Application Next.js de diffusion de fiches internes issues d'une paie déjà validée. Rôles : salarié, responsable d'agence, RH, superadmin. Ne pas présenter ces fiches comme un moteur de calcul réglementaire.

Formats d’import standard, Airtel et Huawei : voir `docs/operations/native-payroll-formats.md` (feuilles sources, rapprochement par matricule, rubriques et contrôles).

## Cibles vérifiées

- Dépôt : `heritianaratsimbazafy99-hue/salary`, branche de production `main` protégée par PR, Quality Gate et E2E Gate.
- Production : `https://salary-alpha-one.vercel.app`.
- Vercel : projet `prj_Ex1TXT7ocPxHuOQsdeN7QBan7DM4`, équipe `team_zdhXAoTJKwj6uRtkG48ju3r9`, Node 24.
- Supabase production : `fqdquhhuvdrsreukfwai`, organisation `upyrptbrobruutzmvbjd`. Une connexion MCP sur une autre référence ne sélectionne pas ce projet.
- Supabase local : projet `salary-platform`, API `127.0.0.1:55421`, Postgres `127.0.0.1:55422`.
- Sentry : organisation `stark-3t`, projet `salary`.

Vérifier les identités et la configuration actuelles avant écriture externe. Ne jamais imprimer ni versionner de secret. Aucune preview Vercel sans demande explicite ; vérifier `previewDeploymentsDisabled` avant push.

## Décisions du propriétaire du 13 octobre 2026

- Conservation des fiches : un an calendaire UTC. Voir `docs/operations/payroll-retention.md`.
- Sauvegardes explicitement reportées. Ne pas activer d'abonnement ou de sauvegarde ; ne pas bloquer cette livraison sur cet ancien prérequis.
- Support et alertes adressés à l'email du propriétaire configuré dans la page d'aide et Sentry.
- Effectif initial : Airtel 300, Huawei 40. Resend Pro choisi, souscription à effectuer par le propriétaire. Quotas, limites et protocole de charge : `docs/operations/capacity-airtel-huawei.md` ; ne pas confondre choix de l'offre et activation effective.

## Vérification et livraison

`npm run verify:ci` : secrets, lint, typage, tests, build et audit. `npm run verify:full` ajoute E2E et advisors. Tests E2E destructifs exclusivement en local ; utiliser les clés de `supabase status`, jamais les clés de production. Après `supabase db reset --local`, exécuter les suites SQL inscrites dans `.github/workflows/ci.yml` ; elles annulent leurs fixtures.

Les mutations de base et services E2E partagés appartiennent à un seul agent à la fois. Répartir les écritures des sous-agents par fichiers. Pour publier, vérifier les gates, appliquer/journaliser les migrations sur la bonne cible, vérifier le commit réellement promu, les emails autorisés et les parcours essentiels ; nettoyer les fixtures et révoquer leurs sessions. Consigner distinctement les preuves locales et de production.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
