# Synthetic restore drill — 2026-10-13

Operator: Codex, on behalf of the project owner. No production data or credentials are consumed by this drill.

## Verified result

The repository migrations applied to an empty PostgreSQL 15.8 database in an isolated container (`--network none`). Five synthetic identities, two agencies, two employees, two published payslips and versions, an audit row and an export job were inserted. A real custom-format `pg_dump` archive was restored into a second empty database with `pg_restore --exit-on-error`.

Thirteen SQL assertions passed after restoration: all five auth/profile links survived; all public tables retained RLS; a manager saw their agency and payslip but neither the other agency's payslip nor HR audit; an employee saw only their published payslip and version; HR could read both agencies, the audit row and the export job; disabling an employee immediately removed payslip access.

Evidence directory from initial successful run: `/tmp/salary-drill-evidence/salary-restore-drill.mB9QNV`. The container stopped automatically and no port was exposed. Its Unix socket used port 55482 internally, separate from the shared development stack.

## Compatibilité avec la rétention ajoutée ensuite

Le script a depuis été adapté à `pg_cron` : préchargement de l'extension, base cron configurée pour la source puis pour la destination lors de la restauration, et ordonnanceur désactivé pendant tout l'exercice. La base source synthétique est supprimée après son export, pour conserver une seule installation de l'extension dans le cluster, conformément à la [documentation de pg_cron](https://github.com/citusdata/pg_cron#setting-up-pg_cron). Le job synthétique restauré est rattaché à la base de destination et contrôlé sans être exécuté. Cette adaptation a été vérifiée en lecture et par `bash -n` seulement ; l'exercice n'a pas été relancé après les nouvelles migrations, conformément au report des sauvegardes. Le succès décrit ci-dessus concerne le jeu de migrations présent lors du premier exercice.

## Reproduction

Use the already installed Supabase PostgreSQL image. The repository mount is read-only. Create a writable temporary evidence directory for the container's `postgres` user, then run:

```bash
mkdir -p /tmp/salary-drill-evidence
chmod 777 /tmp/salary-drill-evidence
docker run --rm --network none --user postgres --entrypoint bash \
  -v "$PWD:/work:ro" \
  -v /tmp/salary-drill-evidence:/evidence \
  -e PG_BIN=/nix/var/nix/profiles/default/bin \
  -e DRILL_BASE=/evidence \
  public.ecr.aws/supabase/postgres:15.8.1.085 \
  /work/scripts/operations/restore-drill.sh
```

The script also accepts `PG_BIN` for an existing working PostgreSQL installation. This Mac's Homebrew PostgreSQL 17 installation has missing compiled-in share/timezone paths; it was not changed. Docker provided the working isolated runtime.

## Limits and remaining production gate

This verifies application schema/data, foreign keys, privileges and database RLS. The Auth schema uses a minimal `auth.users` / `auth.uid()` contract, so it does not prove restoration of GoTrue sessions, credentials, provider settings, Storage objects, or Supabase infrastructure. It is not a restoration of a managed production backup and does not close the managed-backup requirement.

Production project `fqdquhhuvdrsreukfwai` was inspected in the owner's dashboard on 2026-10-13. It remains on Free; the backups page explicitly states Free does not include project backups. The Pro upgrade modal shows a **$25 charge today and a $35 estimated monthly organization invoice**, with seven days of daily backups. No purchase was performed. Managed backup activation, successful backup timestamp and a managed recovery drill remain pending subscription approval and availability of the first backup.

The [official backup documentation](https://supabase.com/docs/guides/platform/backups) confirms daily backups on paid plans and seven days for Pro. PITR is a separate paid add-on, requiring Small compute or greater; seven-day PITR is approximately $100/month in addition to compute/subscription. No PITR purchase was made. Free-plan CLI export is not an acceptable local workaround because the production runbook forbids local production-payroll exports; no pre-approved off-site backup destination was established.

## Décision du propriétaire après le contrôle

Le 13 octobre 2026, le propriétaire a explicitement demandé de reporter les sauvegardes et de continuer la livraison. Aucun abonnement, achat ni sauvegarde de production n’a été activé. Cette dérogation remplace le prérequis de sauvegarde pour cette ouverture ; elle ne signifie pas que les données disposent d’une restauration garantie. Le sujet reste différé, avec le runbook conservé pour sa mise en place ultérieure.
