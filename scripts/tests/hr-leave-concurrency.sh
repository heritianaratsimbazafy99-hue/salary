#!/usr/bin/env bash
# Real concurrency on the local database (two simultaneous sessions):
#  1. two approvals of the same leave revision -> one decision, one debit;
#  2. two approvals of different leaves sharing a balance -> never below zero.
# Fixtures are committed (sessions must see them) and always removed on exit.
set -euo pipefail
PSQL=(docker exec -i supabase_db_salary-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt)
AGENCY=ca000000-0000-4000-8000-000000000001
HR=ca000000-0000-4000-8000-000000000002
EMP=ca000000-0000-4000-8000-000000000003

OUT=$(mktemp -d)
cleanup_db() {
  "${PSQL[@]}" <<SQL >/dev/null
delete from public.audit_logs where agency_id = '$AGENCY' or actor_profile_id = '$HR';
delete from public.agencies where id = '$AGENCY';
delete from public.profiles where id = '$HR';
SQL
}
trap 'cleanup_db; rm -rf "$OUT"' EXIT
cleanup_db

"${PSQL[@]}" <<SQL >/dev/null
insert into public.agencies(id,name,code) values('$AGENCY','Concurrency','CONCURRENCY-TEST');
insert into public.profiles(id,email,full_name,role) values('$HR','concurrency-hr@example.test','RH','hr_central');
insert into public.employees(id,agency_id,employee_id,email,full_name) values('$EMP','$AGENCY','CC-1','concurrency@example.test','Employee');
do \$\$ declare s uuid; d uuid; begin
  s := public.hr_save_site('$HR',null,'$AGENCY','Site','CC',true,null);
  d := public.hr_save_department('$HR',null,'$AGENCY','Dept',true,null);
  perform public.hr_save_employee_record('$HR','$EMP','Agent',d,s,null,null,'ACTIVE','CDI','2026-01-01',null,null);
  perform public.hr_adjust_leave_balance('$HR','$EMP','INITIAL',5,'Solde de test',1);
end \$\$;
SQL

approve() { # leave id; each session holds its transaction open to force the overlap
  "${PSQL[@]}" -c "begin; select public.hr_decide_leave('$HR','$1',true,null,1,false); select pg_sleep(1); commit;" >/dev/null 2>&1 && echo ok || echo refused
}

# Scenario 1: same leave, same revision, approved twice at once.
L1=$("${PSQL[@]}" -c "select public.hr_create_leave('$HR','$EMP','PAID_LEAVE','2026-11-02','2026-11-04','Concurrence 1')")
approve "$L1" > "$OUT/a" & approve "$L1" > "$OUT/b" & wait
RESULTS=$(cat "$OUT/a" "$OUT/b" | sort | tr '\n' ' ')
STATE=$("${PSQL[@]}" -c "select (select count(*) from public.leave_balance_movements where leave_request_id='$L1') || '|' || (select balance_days from public.leave_balances where employee_id='$EMP')")
[ "$RESULTS" = "ok refused " ] && [ "$STATE" = "1|2" ] || { echo "same-leave race failed: results=[$RESULTS] debits|balance=$STATE"; exit 1; }

# Scenario 2: restore 5 days, then two different 3-day leaves race for them.
"${PSQL[@]}" -c "select public.hr_adjust_leave_balance('$HR','$EMP','ADJUSTMENT',3,'Remise à 5',3)" >/dev/null
L2=$("${PSQL[@]}" -c "select public.hr_create_leave('$HR','$EMP','PAID_LEAVE','2026-11-09','2026-11-11','Concurrence 2')")
L3=$("${PSQL[@]}" -c "select public.hr_create_leave('$HR','$EMP','PAID_LEAVE','2026-11-16','2026-11-18','Concurrence 3')")
approve "$L2" > "$OUT/a" & approve "$L3" > "$OUT/b" & wait
RESULTS=$(cat "$OUT/a" "$OUT/b" | sort | tr '\n' ' ')
STATE=$("${PSQL[@]}" -c "select (select count(*) from public.leave_requests where id in ('$L2','$L3') and status='APPROVED') || '|' || (select balance_days from public.leave_balances where employee_id='$EMP')")
[ "$RESULTS" = "ok refused " ] && [ "$STATE" = "1|2" ] || { echo "shared-balance race failed: results=[$RESULTS] approved|balance=$STATE"; exit 1; }
echo "hr-leave-concurrency: same-leave and shared-balance races resolved with one debit each"
