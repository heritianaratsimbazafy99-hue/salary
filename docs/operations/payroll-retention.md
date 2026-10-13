# Rétention des données de paie — un an

La durée validée est d'un an calendaire, calculé en UTC. Un bulletin expire à l'anniversaire de sa publication ; une republication renouvelle la durée de sa version courante, tandis que les anciennes versions expirent chacune depuis leur propre publication. Le 29 février expire le 28 février de l'année suivante à la même heure UTC. Les imports publiés sont conservés un an depuis leur publication ; les imports non publiés, un an depuis leur création.

La migration `20261013092927_payroll_one_year_retention.sql` renseigne les échéances existantes et programme le traitement quotidien à **04:00 UTC (07:00 à Madagascar)**. Elle ne lance aucune purge pendant son application. Les politiques RLS masquent immédiatement les bulletins, versions, imports et lignes expirés aux rôles applicatifs, même si le nettoyage est retardé. Les endpoints utilisant `service_role` doivent toujours faire leur contrôle d'accès et d'expiration avant de lire une ressource : ce rôle contourne RLS.

Le traitement supprime les bulletins expirés et leurs versions, les anciennes versions expirées, puis les imports expirés sans version restante et leurs lignes et erreurs. Il nettoie aussi les notifications de paie, journaux d'audit de paie et jobs d'export arrivés à échéance. Les agences, profils, salariés et comptes Auth ne sont pas supprimés. Les archives, fichiers externes et sauvegardes éventuelles ne sont pas couverts par cette fonction.

## Exécution et surveillance

La fonction `private.purge_expired_payroll` est réservée au propriétaire de la base. Aucun droit d'exécution n'est donné à `anon`, `authenticated` ou `service_role`. Une date de coupure future, infinie ou nulle est refusée. Le lot vaut de 1 à 1 000 objets par catégorie ; les lignes et versions liées peuvent dépasser cette limite lors des cascades. Les verrous déjà pris sont ignorés jusqu'au passage suivant, un verrou transactionnel empêche deux purges simultanées et tout échec annule entièrement le lot.

Le cron exécute un lot de 1 000 avec une limite de 120 secondes et une attente de verrou de 5 secondes. Un arriéré peut donc nécessiter plusieurs passages. Contrôles en lecture seule à réaliser avec l'accès administrateur à la base ciblée :

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'payroll-retention-one-year';

select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'payroll-retention-one-year')
order by start_time desc limit 10;

select * from private.payroll_retention_runs order by id desc limit 10;
```

`has_backlog = true` indique des données encore expirées, y compris celles momentanément verrouillées ou référencées par une version conservée. Une erreur cron ou un arriéré persistant doit être diagnostiqué. Après vérification de la cible et des compteurs, un administrateur peut exécuter des lots supplémentaires de la purge autorisée, en observant la durée et les compteurs entre chaque lot :

```sql
set statement_timeout = '120s';
set lock_timeout = '5s';
select private.purge_expired_payroll(1000);
```

Les journaux privés contiennent uniquement les dates, tailles de lots et compteurs de suppression, pas de contenu salarial. Le message d'erreur retourné par la purge ne contient que le SQLSTATE. Désactiver le cron pour diagnostiquer un incident ne rend pas les données expirées visibles dans l'application.

## Vérification locale

Appliquer toutes les migrations sur la base locale jetable, puis exécuter `scripts/tests/payroll-retention.sql` avec `psql -v ON_ERROR_STOP=1`. Le test fonctionne dans une transaction annulée : droits d'exécution, cron, paramètres invalides/futurs, anniversaire UTC, limite exacte, versions historiques et courantes, immutabilité, cascades, lots, arriéré, idempotence et préservation des identités.

La sauvegarde et l'exercice de restauration ont été explicitement reportés par l'utilisateur ; aucun abonnement ni lancement de sauvegarde n'est demandé par ce document. Ce report ne constitue pas une preuve de restauration et ne doit pas être présenté comme un contrôle réussi.
