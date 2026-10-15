# Imports de paie Airtel et Huawei

L’application diffuse les montants d’une paie déjà validée. Elle lit les résultats enregistrés dans Excel ; elle ne recalcule ni les formules du classeur ni les règles fiscales.

## Formats reconnus

| Format | Feuille principale | Identité | Brut | Net à payer |
| --- | --- | --- | --- | --- |
| Standard | `payroll` | `employee_id`, `email` | `gross_amount` | `net_amount` |
| Airtel | `Recap global` (espaces et casse tolérés) | `Matricule`, `Name` | `Salaire Brut` | `Salaire Net` |
| Huawei | Une seule feuille contenant les en-têtes de paie Huawei | `ID`, `HRMS OFFICAL NAME` | `Total of Gross Salary` | `NP2` |

Les extensions `.xlsx` et `.xls` binaire sont acceptées. Limites : 4 Mo, 2 000 lignes utiles, 128 colonnes utiles sur la feuille principale. Les formats Airtel et Huawei acceptent leurs en-têtes dans les 20 premières lignes. Les onglets de récapitulatif, de congés, de commissions et autres annexes ne sont pas cumulés à la paie principale. Les lignes de totaux sans identité ne créent pas de fiche.

Les montants des cellules sont conservés sans arrondi à l’import. Les formules doivent avoir un résultat enregistré : une erreur Excel ou une formule sans valeur entraîne une erreur de ligne. Recalculer puis enregistrer le classeur dans Excel avant de le réimporter. Les numéros d’erreur correspondent aux vraies lignes de la feuille source, y compris après des titres ou lignes vides.

## Destinataires et période

Pour les formats natifs sans email, le matricule est recherché exclusivement dans les dossiers salariés de l’agence de l’import. La normalisation habituelle conserve les espaces intérieurs et les zéros des identifiants textuels ; elle supprime les espaces aux extrémités et uniformise la casse ASCII. Aucun rapprochement par nom et aucune adresse inventée.

Un matricule inconnu sans email est refusé. Créer ou compléter le dossier RH dans la bonne agence, ou ajouter une colonne `email` à la feuille principale pour le circuit existant de création/invitation. Un matricule absent doit être complété dans le fichier. Les doublons, salariés désactivés et contradictions matricule/email sont signalés.

Sélectionner la période lors de l’import : elle est appliquée aux lignes natives. Une feuille Huawei nommée par un mois anglais (avec année facultative) doit correspondre au mois sélectionné. En l’absence d’année dans la feuille, l’année sélectionnée fait foi ; le nom du fichier ne fixe pas la période.

Après import, vérifier le rapport, les lignes valides et la liste des destinataires, puis confirmer la publication. C’est la publication qui rend les fiches visibles dans les espaces salariés et déclenche les notifications du circuit existant. L’upload seul ne publie rien. Les lignes invalides ne sont pas distribuées.

## Rubriques et retenues

- Airtel : les retenues affichées totalisent `CNAPS 1%`, `OSTIE 1%`, `IRSA` et `Déduction avance`. Les abattements et ajouts nets restent des rubriques distinctes ; `Préavis à déduire` est informatif car déjà intégré au brut source.
- Huawei : elles totalisent `CNaPS Employee 1%`, `OSTIE Employee 1%`, `Individual Income tax IRSA`, `Cash advance` et l’éventuelle régularisation `Total PO amount before TAX (...)`. Les cotisations employeur restent informatives. `NP2` est le net final incluant l’allocation familiale ; `Net pay` est conservé comme information intermédiaire.
- Le total des retenues n’est pas déduit de `brut - net`, car les deux formats peuvent contenir des ajouts nets. Les jours, heures, taux, salaires de référence et sous-totaux sont des informations textuelles, sans être ajoutés aux gains. Les rubriques monétaires reconnues sont reprises comme éléments de paie. Une rubrique nouvelle reste informative : faire vérifier son interprétation avant de s’appuyer sur elle comme gain ou retenue.
- Les coordonnées de paiement et les frais de transfert Airtel ne remplacent pas le net salarial et ne sont pas copiés dans les rubriques du salarié.

## Maintenance

Lecteur : `src/lib/payroll/workbook-reader.ts`. Persistance, identités et erreurs : `src/lib/payroll/import-service.ts`. Aucune migration nécessaire.

ExcelJS reste utilisé pour les exports et modèles. La lecture XLS/XLSX utilise SheetJS 0.20.3 épinglé depuis la distribution officielle, avec intégrité dans le lockfile. Ne pas remplacer cette dépendance par l’ancienne version du registre npm. Documentation : https://docs.sheetjs.com/docs/getting-started/installation/nodejs/.

Tests synthétiques : `native-workbook.test.ts`, `native-import-flow.test.ts`, `tests/e2e/native-payroll.spec.ts`. Les classeurs contenant des données de paie réelles ne doivent pas être copiés dans le dépôt ni utilisés comme fixtures CI.
