\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Run only against the local disposable Supabase database. Everything rolls back.
create temporary table retention_test_ids(name text primary key, id uuid not null);
create temporary table retention_identity_counts as select
  (select count(*) from public.agencies) agencies,
  (select count(*) from public.profiles) profiles,
  (select count(*) from public.employees) employees,
  (select count(*) from auth.users) auth_users;

do $$
declare
  a uuid; manager uuid; employee uuid; old_import uuid; fresh_import uuid;
  old_slip uuid; live_slip uuid; old_version uuid; live_version uuid;
  deadline timestamptz := '2000-03-01 04:00:00+00'; run_id bigint; result private.payroll_retention_runs;
begin
  if has_function_privilege('anon', 'private.purge_expired_payroll(integer,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.purge_expired_payroll(integer,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.purge_expired_payroll(integer,timestamp with time zone)', 'EXECUTE') then
    raise exception 'Purge must only be executable by its database owner';
  end if;
  if not exists(select 1 from cron.job where jobname = 'payroll-retention-one-year' and schedule = '0 4 * * *' and active) then
    raise exception 'Daily cron is missing';
  end if;
  begin perform private.purge_expired_payroll(0, deadline); raise exception 'zero batch accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.purge_expired_payroll(1001, deadline); raise exception 'oversized batch accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.purge_expired_payroll(1, null); raise exception 'null date accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.purge_expired_payroll(null, deadline); raise exception 'null batch accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.purge_expired_payroll(1, statement_timestamp() + interval '1 day'); raise exception 'future cutoff accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.purge_expired_payroll(1, 'infinity'); raise exception 'infinite cutoff accepted'; exception when invalid_parameter_value then null; end;

  insert into public.agencies(name, code) values('Retention test', 'RETENTION-' || gen_random_uuid()) returning id into a;
  insert into public.profiles(email, full_name, role) values(gen_random_uuid() || '@retention.invalid', 'Retention manager', 'agency_manager') returning id into manager;
  insert into public.employees(agency_id, employee_id, email, full_name) values(a, 'RETENTION', gen_random_uuid() || '@retention.invalid', 'Retention employee') returning id into employee;

  insert into public.payroll_imports(agency_id, period_start, period_end, uploaded_by, source_filename, status, created_at, published_at)
  values(a, '1999-01-01', '1999-01-31', manager, 'old.csv', 'READY_FOR_PREVIEW', '1998-01-01', deadline - interval '1 year') returning id into old_import;
  -- A recent publication of an old upload must survive.
  insert into public.payroll_imports(agency_id, period_start, period_end, uploaded_by, source_filename, status, created_at, published_at)
  values(a, '1999-02-01', '1999-02-28', manager, 'fresh.csv', 'PUBLISHED', '1998-01-01', deadline - interval '1 day') returning id into fresh_import;
  insert into public.payroll_import_rows(import_id, agency_id, employee_id, employee_email, employee_name, normalized_data)
  values(old_import, a, 'RETENTION', 'test@retention.invalid', 'Test', '{"grossAmount":100}');
  insert into public.payroll_import_errors(import_id, row_number, field_name, error_code, message, raw_value)
  values(old_import, 1, 'salary', 'INVALID', 'Test', '100');

  update public.payroll_imports set status = 'PUBLISHED' where id = old_import;

  insert into public.payslips(agency_id, employee_id, period_start, period_end, published_by, published_at)
  values(a, employee, '1999-01-01', '1999-01-31', manager, deadline - interval '1 year') returning id into old_slip;
  insert into public.payslip_versions(payslip_id, import_id, agency_id, version_number, snapshot_data, published_by, published_at)
  values(old_slip, old_import, a, 1, '{"grossAmount":100}', manager, deadline - interval '1 year') returning id into old_version;
  update public.payslips set current_version_id = old_version where id = old_slip;

  insert into public.payslips(agency_id, employee_id, period_start, period_end, published_by, published_at)
  values(a, employee, '1999-02-01', '1999-02-28', manager, deadline - interval '1 day') returning id into live_slip;
  insert into public.payslip_versions(payslip_id, import_id, agency_id, version_number, snapshot_data, published_by, published_at, replaced_at)
  values(live_slip, old_import, a, 1, '{"grossAmount":100}', manager, deadline - interval '1 year', deadline - interval '1 day') returning id into old_version;
  insert into public.payslip_versions(payslip_id, import_id, agency_id, version_number, snapshot_data, published_by, published_at)
  values(live_slip, fresh_import, a, 2, '{"grossAmount":200}', manager, deadline - interval '1 day') returning id into live_version;
  update public.payslips set current_version_id = live_version where id = live_slip;

  -- Unpublished imports expire from creation, including the exact boundary.
  insert into public.payroll_imports(agency_id, period_start, period_end, uploaded_by, source_filename, created_at)
  values(a, '1998-01-01', '1998-01-31', manager, 'expired-draft.csv', deadline - interval '1 year');
  insert into public.payroll_imports(agency_id, period_start, period_end, uploaded_by, source_filename, created_at)
  values(a, '1998-02-01', '1998-02-28', manager, 'boundary-kept.csv', deadline - interval '1 year' + interval '1 microsecond');

  insert into public.notifications(recipient_email, notification_type, resource_type, resource_id, created_at)
  values('test@retention.invalid', 'PAYSLIP_PUBLISHED', 'payslip', old_slip, deadline - interval '1 year');
  insert into public.audit_logs(action, resource_type, resource_id, metadata, created_at)
  values('PAYROLL_ROW_ADJUSTED', 'payroll_import_row', gen_random_uuid(), '{"reason":"salary test"}', deadline - interval '1 year');

  begin
    update public.payslip_versions set snapshot_data = '{"grossAmount":999}' where id = live_version;
    raise exception 'published snapshot mutation accepted';
  exception when insufficient_privilege then null; end;

  -- The expiration is a calendar anniversary in UTC, including leap day.
  update public.payslips set published_at = '1996-02-29 12:00:00+00' where id = live_slip;
  if (select expires_at from public.payslips where id = live_slip) <> '1997-02-28 12:00:00+00'::timestamptz then raise exception 'Leap-day anniversary incorrect'; end if;
  update public.payslips set published_at = deadline - interval '1 day' where id = live_slip;

  run_id := private.purge_expired_payroll(1, deadline);
  select * into result from private.payroll_retention_runs where id = run_id;
  if result.deleted_payslips <> 1 or result.deleted_imports > 1 or not result.has_backlog then raise exception 'Batch bound/backlog incorrect'; end if;
  if exists(select 1 from public.payslips where id = old_slip) then raise exception 'Exact expiration did not delete payslip'; end if;
  if exists(select 1 from public.payslip_versions where id = old_version) then raise exception 'Old version survived republication'; end if;
  if not exists(select 1 from public.payslip_versions where id = live_version) then raise exception 'Fresh version deleted'; end if;

  perform private.purge_expired_payroll(1000, deadline);
  if exists(select 1 from public.payroll_imports where id = old_import) then raise exception 'Expired import survived'; end if;
  if exists(select 1 from public.payroll_import_rows where import_id = old_import)
     or exists(select 1 from public.payroll_import_errors where import_id = old_import) then raise exception 'Import salary copies survived'; end if;
  if not exists(select 1 from public.payroll_imports where id = fresh_import) then raise exception 'Recently published old upload deleted'; end if;
  if not exists(select 1 from public.payroll_imports where agency_id = a and source_filename = 'boundary-kept.csv') then raise exception 'Pre-expiration import deleted'; end if;
  if exists(select 1 from public.payroll_imports where agency_id = a and source_filename = 'expired-draft.csv') then raise exception 'Expired draft survived'; end if;
  if exists(select 1 from public.notifications where resource_id = old_slip) then raise exception 'Notification copy survived'; end if;

  run_id := private.purge_expired_payroll(1000, deadline);
  select * into result from private.payroll_retention_runs where id = run_id;
  if result.deleted_payslips <> 0 or result.deleted_versions <> 0 or result.deleted_imports <> 0 then raise exception 'Purge is not idempotent'; end if;
  if not exists(select 1 from public.agencies where id = a) or not exists(select 1 from public.profiles where id = manager)
     or not exists(select 1 from public.employees where id = employee) then raise exception 'Identity deleted'; end if;
  if (select count(*) from auth.users) <> (select auth_users from retention_identity_counts) then raise exception 'Auth user count changed'; end if;
  if (select count(*) from public.agencies) <> (select agencies + 1 from retention_identity_counts)
    or (select count(*) from public.profiles) <> (select profiles + 1 from retention_identity_counts)
    or (select count(*) from public.employees) <> (select employees + 1 from retention_identity_counts) then raise exception 'Unrelated identity changed'; end if;
  raise notice 'PASS: one-year retention, versions, cascades, boundaries, batch size, privileges, cron and identities';
end $$;
rollback;
