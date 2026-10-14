# Contrat du matricule RH et paie

Le matricule identifie un salarié **dans une agence**. Le dossier, le profil et les fiches restent liés à son UUID, jamais fusionnés à partir de son nom ou de son email.

La règle partagée (`src/lib/employees/identity.ts` / `private.canonical_employee_id`) supprime les espaces de bord définis par ECMAScript, transforme les seules lettres ASCII `a–z` en `A–Z`, puis exige entre 1 et 80 points de code Unicode. Les autres caractères Unicode restent inchangés : `équipe-ß` devient `éQUIPE-ß` ; `é` et `É` restent distincts. Aucun changement de locale, normalisation NFC, translittération ou expansion Unicode ne doit être ajouté d’un seul côté.

RH, le vrai parseur XLSX, les rattachements et les écritures directes en base suivent cette règle. Les variantes de casse ASCII restent uniques par agence, même si le salarié est désactivé. Le même matricule dans deux agences conserve deux identités distinctes.

Un import signale à la ligne les matricules/emails répétés, un salarié désactivé, un email déjà attribué à un autre matricule et un email différent du dossier existant. La paie ne change plus silencieusement l’email de connexion : corriger le fichier ou faire vérifier le dossier avant de réimporter. La revue et la publication recontrôlent les conflits en base, y compris pour les imports antérieurs et les courses concurrentes. Aucun rapprochement automatique par email n’est effectué.

## Migration

`20261014231000_employee_identity_canonicalization.sql` verrouille les écritures pendant le préflight. Toute collision de clé canonique entre salariés de la même agence, invitations de même statut ou lignes d’un import non publié arrête la transaction avant la normalisation. Une valeur vide ou de plus de 80 points de code bloque aussi la migration. Il faut alors arbitrer explicitement l’identité concernée ; ne pas supprimer/fusionner automatiquement les lignes pour faire passer la migration.

Les UUID, `profile_id`, sessions et relations RH/paie restent inchangés. Les invitations conservent UUID, jeton et statut. Seuls les matricules métier et les représentations normalisées des imports non publiés changent. Leur compteur de salariés inconnus est recalculé et leur revue devient périmée. Les lignes d’import déjà publié et les snapshots de fiche restent intacts.

Le fichier comporte `BEGIN`/`COMMIT` car la CLI locale n’entoure pas chaque migration d’une transaction. Si la publication journalise la migration dans une transaction externe, supprimer uniquement ces deux délimiteurs lors de l’assemblage, puis exécuter SQL et inscription dans `supabase_migrations.schema_migrations` dans la même transaction.

Vérifications locales : `scripts/tests/employee-identity.sql` pour les invariants DB, `scripts/tests/employee-identity-migration.sh` pour les données legacy/collisions avec rollback, les tests Vitest d’identité et `tests/e2e/hr-payroll-identity.spec.ts` pour le formulaire RH → vrai XLSX → revue → publication → accès salarié.
