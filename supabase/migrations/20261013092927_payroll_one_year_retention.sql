-- One calendar year in UTC. This migration stamps deadlines and schedules future
-- maintenance; it deliberately does not call the destructive maintenance function.
create extension if not exists pg_cron;

alter table public.payroll_imports add column published_at timestamptz;
update public.payroll_imports i set published_at = v.published_at
from (select import_id, max(published_at) as published_at from public.payslip_versions group by import_id) v
where i.id = v.import_id;

create function private.stamp_payroll_import_publication() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'PUBLISHED' and (tg_op = 'INSERT' or old.status <> 'PUBLISHED') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_payroll_import_publication() from public, anon, authenticated, service_role;
create trigger stamp_payroll_import_publication before insert or update of status on public.payroll_imports
for each row execute function private.stamp_payroll_import_publication();

create function private.stamp_payslip_expiration() returns trigger
language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
begin
  new.expires_at := new.published_at + interval '1 year';
  return new;
end;
$$;
revoke all on function private.stamp_payslip_expiration() from public, anon, authenticated, service_role;
create trigger stamp_payslip_expiration before insert or update of published_at, expires_at on public.payslips
for each row execute function private.stamp_payslip_expiration();
update public.payslips set expires_at = (published_at at time zone 'UTC' + interval '1 year') at time zone 'UTC';

create index payslips_retention_idx on public.payslips(expires_at);
create index payslip_versions_retention_idx on public.payslip_versions(((published_at at time zone 'UTC') + interval '1 year'));
create index payroll_imports_retention_idx on public.payroll_imports(((coalesce(published_at, created_at) at time zone 'UTC') + interval '1 year'));
create index payslip_versions_import_id_idx on public.payslip_versions(import_id);
create index notifications_retention_idx on public.notifications(created_at);
create index export_jobs_retention_idx on public.export_jobs(created_at);

-- Expired salary content is unavailable to application roles even before the
-- next daily cleanup (or if the scheduler is unavailable).
create policy payslips_within_retention on public.payslips as restrictive for select to authenticated
using (expires_at > now());
create policy versions_within_retention on public.payslip_versions as restrictive for select to authenticated
using (((published_at at time zone 'UTC') + interval '1 year') > (now() at time zone 'UTC'));
create policy imports_within_retention on public.payroll_imports as restrictive for select to authenticated
using (((coalesce(published_at, created_at) at time zone 'UTC') + interval '1 year') > (now() at time zone 'UTC'));
create policy import_rows_within_retention on public.payroll_import_rows as restrictive for select to authenticated
using (exists (select 1 from public.payroll_imports i where i.id = import_id));
create policy import_errors_within_retention on public.payroll_import_errors as restrictive for select to authenticated
using (exists (select 1 from public.payroll_imports i where i.id = import_id));

create table private.payroll_retention_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp(),
  cutoff_at timestamptz not null,
  batch_size integer not null,
  deleted_payslips integer not null,
  deleted_versions integer not null,
  deleted_imports integer not null,
  deleted_import_rows bigint not null,
  deleted_import_errors bigint not null,
  deleted_notifications integer not null,
  deleted_audit_logs integer not null,
  deleted_export_jobs integer not null,
  has_backlog boolean not null
);
alter table private.payroll_retention_runs enable row level security;
revoke all on private.payroll_retention_runs from public, anon, authenticated, service_role;
revoke all on sequence private.payroll_retention_runs_id_seq from public, anon, authenticated, service_role;

-- Owner-only, SECURITY INVOKER: no definer endpoint and no additional DELETE
-- grants. SKIP LOCKED defers in-flight records to a subsequent run. Any error rolls the
-- entire batch back and reaches pg_cron's run history without row data.
create function private.purge_expired_payroll(p_batch_size integer default 500, p_now timestamptz default now())
returns bigint language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
declare
  v_started timestamptz := clock_timestamp();
  v_payslips uuid[]; v_versions uuid[]; v_imports uuid[];
  v_p integer := 0; v_v integer := 0; v_i integer := 0;
  v_rows bigint := 0; v_errors bigint := 0;
  v_n integer := 0; v_a integer := 0; v_e integer := 0;
  v_backlog boolean; v_run bigint;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 1000 or p_now is null or not isfinite(p_now) or p_now > statement_timestamp() then
    raise exception 'Invalid payroll retention parameters' using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(74163, 1) then
    raise exception 'Payroll retention is already running' using errcode = '55P03';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_payslips from (
    select id from public.payslips where expires_at <= p_now
    order by expires_at, id limit p_batch_size for update skip locked
  ) candidates;
  select count(*) into v_v from public.payslip_versions where payslip_id = any(v_payslips);
  -- Deleting the parent resolves the current-version circular FK and cascades
  -- every version. No published snapshot is updated or made mutable.
  delete from public.payslips where id = any(v_payslips);
  get diagnostics v_p = row_count;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_versions from (
    select v.id from public.payslip_versions v
    where ((v.published_at at time zone 'UTC') + interval '1 year') <= (p_now at time zone 'UTC')
      and not exists (select 1 from public.payslips p where p.current_version_id = v.id)
    order by v.published_at, v.id limit p_batch_size for update of v skip locked
  ) candidates;
  delete from public.payslip_versions where id = any(v_versions);
  v_v := v_v + cardinality(v_versions);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_imports from (
    select i.id from public.payroll_imports i
    where ((coalesce(i.published_at, i.created_at) at time zone 'UTC') + interval '1 year') <= (p_now at time zone 'UTC')
      and not exists (select 1 from public.payslip_versions v where v.import_id = i.id)
    order by coalesce(i.published_at, i.created_at), i.id limit p_batch_size for update of i skip locked
  ) candidates;
  select count(*) into v_rows from public.payroll_import_rows where import_id = any(v_imports);
  select count(*) into v_errors from public.payroll_import_errors where import_id = any(v_imports);
  delete from public.payroll_imports where id = any(v_imports);
  get diagnostics v_i = row_count;

  -- Logs can contain free text and recipient PII; do not leave an indefinite
  -- secondary copy. Bound each auxiliary cleanup independently.
  delete from public.notifications where id in (
    select id from public.notifications where resource_type in ('payslip', 'payroll_import')
      and (created_at + interval '1 year' <= p_now or resource_id = any(v_payslips) or resource_id = any(v_imports))
    order by created_at, id limit p_batch_size for update skip locked
  );
  get diagnostics v_n = row_count;
  delete from public.audit_logs where id in (
    select id from public.audit_logs
    where resource_type in ('payslip', 'payslip_version', 'payroll_import', 'payroll_import_row', 'payroll_analytics', 'export_job')
      and created_at + interval '1 year' <= p_now
    order by created_at, id limit p_batch_size for update skip locked
  );
  get diagnostics v_a = row_count;
  delete from public.export_jobs where id in (
    select id from public.export_jobs where created_at + interval '1 year' <= p_now
    order by created_at, id limit p_batch_size for update skip locked
  );
  get diagnostics v_e = row_count;

  select exists(select 1 from public.payslips where expires_at <= p_now)
    or exists(select 1 from public.payslip_versions where published_at + interval '1 year' <= p_now)
    or exists(select 1 from public.payroll_imports where coalesce(published_at, created_at) + interval '1 year' <= p_now)
    or exists(select 1 from public.notifications where resource_type in ('payslip', 'payroll_import') and created_at + interval '1 year' <= p_now)
    or exists(select 1 from public.audit_logs where resource_type in ('payslip', 'payslip_version', 'payroll_import', 'payroll_import_row', 'payroll_analytics', 'export_job') and created_at + interval '1 year' <= p_now)
    or exists(select 1 from public.export_jobs where created_at + interval '1 year' <= p_now)
    into v_backlog;

  insert into private.payroll_retention_runs(started_at, cutoff_at, batch_size, deleted_payslips, deleted_versions,
    deleted_imports, deleted_import_rows, deleted_import_errors, deleted_notifications, deleted_audit_logs, deleted_export_jobs, has_backlog)
  values(v_started, p_now, p_batch_size, v_p, v_v, v_i, v_rows, v_errors, v_n, v_a, v_e, v_backlog) returning id into v_run;
  return v_run;
exception when others then
  raise exception 'Payroll retention failed (SQLSTATE %)', sqlstate using errcode = sqlstate;
end;
$$;
revoke all on function private.purge_expired_payroll(integer, timestamptz) from public, anon, authenticated, service_role;

-- Fail configuration loudly instead of silently scheduling in a local timezone.
do $$ begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Payroll retention requires cron.timezone UTC/GMT';
  end if;
end $$;
select cron.schedule('payroll-retention-one-year', '0 4 * * *',
  $job$set statement_timeout = '120s'; set lock_timeout = '5s'; select private.purge_expired_payroll(1000);$job$);
