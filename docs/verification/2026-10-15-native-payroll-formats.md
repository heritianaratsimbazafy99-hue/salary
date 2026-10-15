# Adaptation Airtel / Huawei — vérification locale du 15 octobre 2026

## Périmètre implémenté

Lecture directe du fichier Airtel XLSX et du fichier Huawei XLS binaire, détection de la feuille principale, correspondance des champs et conservation des valeurs Excel enregistrées. Résolution de l’email absent par matricule canonique dans la même agence. Conservation du circuit existant de revue des destinataires, publication, activation et consultation/PDF salarié. Aucun changement de schéma.

Principaux fichiers : `src/lib/payroll/workbook-reader.ts`, `src/lib/payroll/import-service.ts`, API et formulaire d’import. Guide : `docs/operations/native-payroll-formats.md`.

## Fichiers réels, en lecture seule

Les deux classeurs fournis dans Downloads ont été lus localement. Aucun classeur, nom, email, coordonnées bancaires ni montant personnel n’a été ajouté au dépôt ou envoyé à la base.

- Airtel : `Recap global`, 279 lignes de salariés. Comparaison de chaque brut et net importé aux cellules AR/BH : égalité exacte. 262 matricules renseignés et distincts ; 17 lignes sans matricule à compléter. Aucun résultat Excel en erreur sur les lignes retenues.
- Huawei : `SEPTEMBER`, 37 lignes de salariés, 37 matricules distincts. Comparaison de chaque brut et net importé aux cellules Z/AT : égalité exacte. Le net final retenu est `NP2`, après allocation familiale. L’erreur Excel d’une annexe/footer ne devient pas une fiche salarié.
- Les onglets auxiliaires et totaux n’ont pas été importés comme salariés. Les dimensions de mise en forme Airtel jusqu’à la ligne 1 048 554 ne provoquent pas l’itération de toutes les lignes vides.
- Les feuilles de paie natives n’ont pas d’email : le rattachement réel dépend des dossiers RH de la bonne agence. Aucune vérification ni modification des dossiers de production n’a été faite.

## Contrôles

- Scan de secrets existant : réussi sur les fichiers suivis ; nouvelles fixtures exclusivement synthétiques.
- ESLint : aucune erreur, deux avertissements préexistants sur `window.location.assign`.
- Typage TypeScript : réussi.
- Suite Vitest : 59 fichiers, 551 tests réussis. Dernier contrôle ciblé après ajustement des rubriques : 24 tests natifs réussis.
- Build Next.js optimisé : réussi. Le premier build dans le sandbox ne progressait plus ; relance autorisée hors sandbox, Sentry et upload de sourcemaps désactivés.
- Audit npm : zéro vulnérabilité. Le DNS du sandbox bloquait l’audit ; vérification réseau autorisée réussie.
- E2E Chromium : trois parcours réussis — standard, Airtel, Huawei. Les deux parcours natifs contrôlent le matricule d’un dossier existant, l’absence de publication à l’upload, la revue des destinataires, la publication, l’activation, l’espace salarié et un PDF valide. Les quantités restent textuelles, sans suffixe monétaire.
- E2E mobile : deux parcours natifs Airtel et Huawei réussis sur le build final, consultation et PDF compris.

Les E2E utilisent uniquement Supabase `http://127.0.0.1:55421`, les clés de `supabase status`, un serveur sur `127.0.0.1:3107`, le collecteur de mails local et des fixtures nettoyées en `finally`. Aucun reset de base.

## État de livraison

Implémenté et vérifié en local. Aucun commit, push, PR, preview, déploiement, migration, import réel ou envoi de notification de production réalisé. Les fichiers préexistants d’autres travaux ont été conservés.
