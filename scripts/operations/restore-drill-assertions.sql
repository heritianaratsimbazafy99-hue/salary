\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %',label; end $$;
select pg_temp.assert_true((select count(*)=5 from public.profiles p join auth.users u on u.id=p.auth_user_id),'all 5 auth/profile links survive');
select pg_temp.assert_true((select count(*)=0 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),'RLS enabled on every public table');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from public.agencies),'manager sees one agency');
select pg_temp.assert_true((select count(*)=0 from public.payslips where agency_id='30000000-0000-0000-0000-000000000002'),'manager cannot read other agency payslips');
select pg_temp.assert_true((select count(*)=1 from public.payslips),'manager sees own agency payslip');
select pg_temp.assert_true((select count(*)=0 from public.audit_logs),'manager cannot read HR audit');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.payslips),'employee sees own published payslip');
select pg_temp.assert_true((select count(*)=0 from public.payslips where employee_id<>'40000000-0000-0000-0000-000000000001'),'employee cannot read other employee payslip');
select pg_temp.assert_true((select count(*)=1 from public.payslip_versions),'employee sees own published version');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select pg_temp.assert_true((select count(*)=2 from public.payslips),'HR reads both agencies');
select pg_temp.assert_true((select count(*)=1 from public.audit_logs),'HR reads restored audit log');
select pg_temp.assert_true((select count(*)=1 from public.export_jobs),'HR reads restored export job');
reset role;
update public.profiles set is_active=false where id='20000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.payslips),'disabled employee loses access after restore');
reset role;
rollback;
