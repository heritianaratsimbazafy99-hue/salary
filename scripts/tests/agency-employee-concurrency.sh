#!/usr/bin/env bash
# Real overlapping PostgreSQL sessions, exclusively inside the known local container.
# No auth/email delivery or remote connection. Fixtures are unique per invocation.
set -euo pipefail
PSQL=(docker exec -i -e 'PGOPTIONS=-c statement_timeout=12000 -c lock_timeout=8000' supabase_db_salary-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -qAt)
AGENCY=$(uuidgen | tr '[:upper:]' '[:lower:]')
M1=$(uuidgen | tr '[:upper:]' '[:lower:]')
M2=$(uuidgen | tr '[:upper:]' '[:lower:]')
EMP=$(uuidgen | tr '[:upper:]' '[:lower:]')
OUT=$(mktemp -d)
PIDS=()
cleanup_db() {
  "${PSQL[@]}" <<SQL >/dev/null
begin;
delete from public.notifications where resource_type='payslip' and resource_id in(select id from public.payslips where agency_id='$AGENCY');
update public.payslips set current_version_id=null where agency_id='$AGENCY';
delete from public.payslip_versions where agency_id='$AGENCY';
delete from public.payslips where agency_id='$AGENCY';
delete from public.payroll_imports where agency_id='$AGENCY';
delete from public.agency_employee_events where agency_id='$AGENCY';
delete from public.agency_employee_change_requests where agency_id='$AGENCY';
delete from public.employee_imports where agency_id='$AGENCY';
delete from public.audit_logs where agency_id='$AGENCY' or actor_profile_id in('$M1','$M2');
delete from public.agencies where id='$AGENCY';
delete from public.profiles where id in('$M1','$M2');
commit;
SQL
}
cleanup() {
  local result=$?
  trap - EXIT
  for pid in "${PIDS[@]:-}"; do [ -z "$pid" ] || wait "$pid" 2>/dev/null || true; done
  if ! cleanup_db; then echo 'FAIL: concurrency fixture cleanup failed' >&2; result=1; fi
  rm -rf "$OUT"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${PSQL[@]}" <<SQL >/dev/null
insert into public.agencies(id,name,code) values('$AGENCY','Agency concurrency','CC-'||'$AGENCY');
insert into public.profiles(id,email,full_name,role) values
('$M1','$M1@example.test','Responsable A1','agency_manager'),
('$M2','$M2@example.test','Responsable A2','agency_manager');
insert into public.agency_memberships(profile_id,agency_id) values('$M1','$AGENCY'),('$M2','$AGENCY');
insert into public.employees(id,agency_id,employee_id,email,full_name) values('$EMP','$AGENCY','EDIT','$EMP@example.test','Initial');
SQL

run_session() {
  local name=$1 sql=$2
  if printf '%s\n%s\n' "set application_name='agency-cc-$M1-$name';" "$sql" | "${PSQL[@]}" >"$OUT/$name.log" 2>&1; then echo ok >"$OUT/$name.status"; else echo failed >"$OUT/$name.status"; fi
}
wait_barrier() {
  local name=$1
  # The first session reports only after obtaining the real business locks.
  # Its transaction stays open for 3 s; the contender runs while those locks exist.
  for ((attempt=0; attempt<100; attempt++)); do
    if grep -q '^LOCK_HELD$' "$OUT/$name.log"; then return; fi
    if [ -f "$OUT/$name.status" ]; then cat "$OUT/$name.log" >&2; echo "FAIL: $name exited before barrier" >&2; exit 1; fi
    sleep 0.05
  done
  echo "FAIL: timeout waiting for $name barrier" >&2; exit 1
}
assert_waiting_for_lock() {
  local name=$1 waiting
  # A short read-only observer verifies overlap, rather than assuming scheduling.
  for ((attempt=0; attempt<20; attempt++)); do
    waiting=$("${PSQL[@]}" -c "select count(*) from pg_stat_activity where application_name='agency-cc-$M1-$name' and wait_event_type='Lock'")
    [ "$waiting" = 1 ] && return
    if [ -f "$OUT/$name.status" ]; then cat "$OUT/$name.log" >&2; echo "FAIL: $name never waited on the competing transaction" >&2; exit 1; fi
    sleep 0.05
  done
  echo "FAIL: $name overlap was not observed" >&2; exit 1
}
assert_result() {
  local name=$1 expected=$2
  if [ "$expected" = ok ]; then
    [ "$(cat "$OUT/$name.status")" = ok ] || { cat "$OUT/$name.log" >&2; exit 1; }
  else
    [ "$(cat "$OUT/$name.status")" = failed ] && grep -Eq "ERROR:[[:space:]]+$expected:" "$OUT/$name.log" || { cat "$OUT/$name.log" >&2; echo "FAIL: $name expected SQLSTATE $expected" >&2; exit 1; }
  fi
}
assert_db() {
  local label=$1 sql=$2 expected=$3 actual
  actual=$("${PSQL[@]}" -c "$sql")
  [ "$actual" = "$expected" ] || { echo "FAIL: $label expected [$expected], got [$actual]" >&2; exit 1; }
}
new_preview() {
  local identity=$1
  "${PSQL[@]}" <<SQL
set role service_role;
with i as(select public.agency_preview_employee_import('$M1','$AGENCY',jsonb_build_array(
 jsonb_build_object('row_number',2,'matricule','$identity','nom_complet','Concurrent identity','email',lower('$identity-$AGENCY@example.test'),'issues','[]'::jsonb),
 jsonb_build_object('row_number',3,'matricule','$identity-ONLY','nom_complet','Must remain absent','email',lower('$identity-only-$AGENCY@example.test'),'issues','[]'::jsonb))) id)
select id from i;
SQL
}
preview_fingerprint() { "${PSQL[@]}" -c "select fingerprint from public.employee_imports where id='$1'"; }

# 1. Two legitimate managers update the same observed identity + operations revisions.
run_session edit_first "begin;
set local role service_role;
select public.agency_save_employee('$M1','$EMP',1,1,'Winner','Poste retenu',null,null,null,'Première modification');
\echo LOCK_HELD
select pg_sleep(3);
commit;" & PIDS+=("$!")
wait_barrier edit_first
run_session edit_second "begin;
set local role service_role;
select public.agency_save_employee('$M2','$EMP',1,1,'Loser','Poste écrasé',null,null,null,'Modification concurrente');
commit;" & PIDS+=("$!")
assert_waiting_for_lock edit_second
wait "${PIDS[0]}" "${PIDS[1]}"
assert_result edit_first ok
assert_result edit_second PT409
assert_db 'winning identity and operations preserved' "select e.full_name||'|'||e.revision||'|'||o.job_title||'|'||o.revision from public.employees e join public.employee_agency_operations o on o.employee_id=e.id where e.id='$EMP'" 'Winner|2|Poste retenu|2'
assert_db 'exactly one update audit' "select count(*) from public.agency_employee_events where employee_id='$EMP' and action='employee.updated'" 1

# 2. A creation remains uncommitted while the reviewed import tries to confirm.
IMPORT=$(new_preview CREATE-RACE)
FP=$(preview_fingerprint "$IMPORT")
run_session create_first "begin;
set local role service_role;
select public.agency_create_employee('$M2','$AGENCY','CREATE-RACE','create-race-$AGENCY@example.test','Concurrent identity');
\echo LOCK_HELD
select pg_sleep(3);
commit;" & CREATE_PID=$!; PIDS+=("$CREATE_PID")
wait_barrier create_first
run_session create_import "begin;
set local role service_role;
select public.agency_commit_employee_import('$M1','$IMPORT','$FP');
commit;" & IMPORT_PID=$!; PIDS+=("$IMPORT_PID")
assert_waiting_for_lock create_import
wait "$CREATE_PID" "$IMPORT_PID"
assert_result create_first ok
assert_result create_import PT409
assert_db 'creation race has no duplicate or partial import' "select count(*) filter(where employee_id='CREATE-RACE')||'|'||count(*) filter(where employee_id='CREATE-RACE-ONLY') from public.employees where agency_id='$AGENCY'" '1|0'
assert_db 'stale creation import not committed' "select status||'|'||created_count from public.employee_imports where id='$IMPORT'" 'READY|0'
"${PSQL[@]}" -c "set role service_role; select public.agency_review_employee_import('$M1','$IMPORT','$FP','{}')" >/dev/null
FP=$(preview_fingerprint "$IMPORT")
assert_db 'fresh review ignores winner and creates only remaining employee' "set role service_role; select public.agency_commit_employee_import('$M1','$IMPORT','$FP')" 1

# 3. The payroll publisher creates the identity while the employee import waits.
IMPORT=$(new_preview PAY-RACE)
FP=$(preview_fingerprint "$IMPORT")
PAYROLL=$("${PSQL[@]}" -c "insert into public.payroll_imports(agency_id,period_start,period_end,uploaded_by,source_filename,status) values('$AGENCY','2026-10-01','2026-10-31','$M2','concurrency-local.xlsx','READY_FOR_PREVIEW') returning id")
"${PSQL[@]}" <<SQL >/dev/null
insert into public.payroll_import_rows(import_id,agency_id,employee_id,employee_email,employee_name,normalized_data)
values('$PAYROLL','$AGENCY','PAY-RACE','pay-race-$AGENCY@example.test','Payroll snapshot name','{"grossAmount":100,"deductionsTotal":10,"netAmount":90,"employeeName":"Payroll snapshot name"}');
SQL
run_session payroll_first "begin;
set local role service_role;
select * from public.publish_payroll_import('$PAYROLL','$M2','$AGENCY');
\echo LOCK_HELD
select pg_sleep(3);
commit;" & PAYROLL_PID=$!; PIDS+=("$PAYROLL_PID")
wait_barrier payroll_first
run_session payroll_import "begin;
set local role service_role;
select public.agency_commit_employee_import('$M1','$IMPORT','$FP');
commit;" & IMPORT_PID=$!; PIDS+=("$IMPORT_PID")
assert_waiting_for_lock payroll_import
wait "$PAYROLL_PID" "$IMPORT_PID"
assert_result payroll_first ok
assert_result payroll_import PT409
assert_db 'payroll winner has no duplicate or partial employee import' "select count(*) filter(where employee_id='PAY-RACE')||'|'||count(*) filter(where employee_id='PAY-RACE-ONLY') from public.employees where agency_id='$AGENCY'" '1|0'
assert_db 'payroll preserved its name and single published snapshot' "select e.full_name||'|'||(select count(*) from public.payslip_versions where import_id='$PAYROLL') from public.employees e where e.agency_id='$AGENCY' and e.employee_id='PAY-RACE'" 'Payroll snapshot name|1'
assert_db 'stale payroll import not committed' "select status||'|'||created_count from public.employee_imports where id='$IMPORT'" 'READY|0'

# 4. Scope revocation commits while an import confirmation is waiting for the membership.
IMPORT=$(new_preview REVOKED)
FP=$(preview_fingerprint "$IMPORT")
run_session revoke_first "begin;
delete from public.agency_memberships where profile_id='$M1' and agency_id='$AGENCY';
\echo LOCK_HELD
select pg_sleep(3);
commit;" & REVOKE_PID=$!; PIDS+=("$REVOKE_PID")
wait_barrier revoke_first
run_session revoked_import "begin;
set local role service_role;
select public.agency_commit_employee_import('$M1','$IMPORT','$FP');
commit;" & IMPORT_PID=$!; PIDS+=("$IMPORT_PID")
assert_waiting_for_lock revoked_import
wait "$REVOKE_PID" "$IMPORT_PID"
assert_result revoke_first ok
assert_result revoked_import 42501
assert_db 'revoked manager created no retained row' "select count(*) from public.employees where agency_id='$AGENCY' and employee_id in('REVOKED','REVOKED-ONLY')" 0
assert_db 'revoked import remains uncommitted' "select status||'|'||created_count from public.employee_imports where id='$IMPORT'" 'READY|0'
echo 'agency-employee-concurrency: edit revisions, individual creation/import, payroll/import and scope revocation passed'
