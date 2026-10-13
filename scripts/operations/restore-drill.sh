#!/usr/bin/env bash
set -euo pipefail
# No production credentials or network sources are accepted by this drill.
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DRILL_DIR="$(mktemp -d "${DRILL_BASE:-/tmp}/salary-restore-drill.XXXXXX")"
export PGHOST="$DRILL_DIR" PGPORT=55482 PGUSER=postgres
cleanup() { "$PG_BIN/pg_ctl" -D "$DRILL_DIR/data" -m fast stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$DRILL_DIR/data" -U postgres --auth=trust --no-locale > "$DRILL_DIR/init.log"
# pg_cron must be preloaded and installed in its configured database. Keep
# scheduling disabled throughout this synthetic drill, including after restore.
SERVER_OPTIONS="-k $DRILL_DIR -p 55482 -c listen_addresses='' -c shared_preload_libraries=pg_cron -c cron.launch_active_jobs=off"
"$PG_BIN/pg_ctl" -D "$DRILL_DIR/data" -l "$DRILL_DIR/server.log" -o "$SERVER_OPTIONS -c cron.database_name=drill_source" start >/dev/null
"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 <<'SQL' > "$DRILL_DIR/setup.log"
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create database drill_source;
create database drill_restored;
SQL
"$PG_BIN/psql" -d drill_source -v ON_ERROR_STOP=1 <<'SQL' >> "$DRILL_DIR/setup.log"
-- Minimal Auth contract for database/RLS verification, not a GoTrue restore.
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
 (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
SQL
for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
  "$PG_BIN/psql" -d drill_source -v ON_ERROR_STOP=1 -f "$migration" >> "$DRILL_DIR/setup.log" 2>&1
  printf '%s\n' "$(basename "$migration")" >> "$DRILL_DIR/migrations.txt"
done
"$PG_BIN/psql" -d drill_source -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/operations/restore-drill-fixture.sql" >> "$DRILL_DIR/setup.log"
"$PG_BIN/pg_dump" -d drill_source --format=custom --file="$DRILL_DIR/synthetic.dump"
# CREATE EXTENSION pg_cron validates the configured database during restore.
# Restart this isolated cluster against the destination; no job may run.
"$PG_BIN/pg_ctl" -D "$DRILL_DIR/data" -m fast -l "$DRILL_DIR/server.log" -o "$SERVER_OPTIONS -c cron.database_name=drill_restored" restart >/dev/null
# pg_cron supports one installation per cluster. The synthetic source is already
# captured in the dump; remove it before creating the restored installation.
"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 -c 'drop database drill_source' >> "$DRILL_DIR/restore.log"
"$PG_BIN/pg_restore" --exit-on-error --dbname=drill_restored "$DRILL_DIR/synthetic.dump" >> "$DRILL_DIR/restore.log" 2>&1
"$PG_BIN/psql" -d drill_restored -v ON_ERROR_STOP=1 <<'SQL' >> "$DRILL_DIR/restore.log"
-- Dumped cron configuration retains its original database name. Retarget only
-- this synthetic job; cron.launch_active_jobs stays off for the whole drill.
update cron.job set database = current_database()
where jobname = 'payroll-retention-one-year';
do $$ begin
 if current_setting('cron.launch_active_jobs') <> 'off'
   or current_setting('cron.database_name') <> current_database()
   or not exists(select 1 from cron.job where jobname='payroll-retention-one-year'
     and database=current_database() and schedule='0 4 * * *') then
  raise exception 'Restored cron configuration invalid or scheduler enabled';
 end if;
end $$;
SQL
"$PG_BIN/psql" -d drill_restored -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/operations/restore-drill-assertions.sql" 2>&1 | tee "$DRILL_DIR/assertions.log"
printf 'SUCCESS: synthetic dump and restore. Evidence: %s\n' "$DRILL_DIR"
printf 'Scope: repository migrations and minimal auth contract; no production records, Storage objects, GoTrue service, or managed backup were restored.\n'
