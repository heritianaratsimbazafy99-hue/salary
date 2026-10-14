#!/usr/bin/env bash
# Rehearse the migration against legacy values without retaining schema or data.
# Deliberately fixed to local Supabase: this script cannot target production.
set -euo pipefail
cd "$(dirname "$0")/../.."
identity_tmp=$(mktemp -d)
trap 'rm -rf "$identity_tmp"' EXIT
cat > "$identity_tmp/prefix.sql" <<'SQL'
\set ON_ERROR_STOP on
begin;
drop trigger if exists normalize_employee_matricule on public.employees;
drop trigger if exists normalize_employee_matricule on public.employee_invitations;
drop trigger if exists normalize_employee_matricule on public.payroll_import_rows;
alter table public.employees drop constraint if exists employees_canonical_matricule;
alter table public.employee_invitations drop constraint if exists invitations_canonical_matricule;
drop function if exists private.normalize_employee_matricule();
drop function if exists private.canonical_employee_id(text);
SQL
# Keep the whole rehearsal inside the outer rollback-only transaction.
sed '/^begin;$/d; /^commit;$/d' supabase/migrations/20261014231000_employee_identity_canonicalization.sql > "$identity_tmp/migration.sql"
cat "$identity_tmp/prefix.sql" scripts/tests/employee-identity-migration-fixtures.sql "$identity_tmp/migration.sql" scripts/tests/employee-identity-migration-assertions.sql > "$identity_tmp/success.sql"
echo 'rollback;' >> "$identity_tmp/success.sql"
docker exec -i supabase_db_salary-platform psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$identity_tmp/success.sql"
cat "$identity_tmp/prefix.sql" scripts/tests/employee-identity-migration-fixtures.sql > "$identity_tmp/collision.sql"
cat >> "$identity_tmp/collision.sql" <<'SQL'
insert into public.employees(agency_id,employee_id,email,full_name) values('b1000000-0000-4000-8000-000000000001','LEGACY-AB','collision@example.test','Collision');
SQL
cat "$identity_tmp/migration.sql" >> "$identity_tmp/collision.sql"
if docker exec -i supabase_db_salary-platform psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$identity_tmp/collision.sql" > "$identity_tmp/collision.log" 2>&1; then
  echo 'FAIL: canonical collision accepted' >&2
  exit 1
fi
grep -q 'employee_matricule_collision: manual identity review required' "$identity_tmp/collision.log"
# A failed psql connection rolls back the outer transaction, including all DDL.
docker exec -i supabase_db_salary-platform psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c "do \$\$ begin if exists(select 1 from public.agencies where id='b1000000-0000-4000-8000-000000000001') then raise exception 'migration fixtures survived'; end if; if private.canonical_employee_id('ab-001') <> 'AB-001' then raise exception 'schema rollback failed'; end if; end \$\$;"
echo 'PASS: legacy normalization and collision refusal; all fixtures and DDL rolled back'
