-- Dashboards, exports, contract alerts and monthly reports.
-- One function computes the indicators for a profile and its live scope: HR sees
-- everything, team managers their scope, client viewers their sites (without
-- absence figures, which are leave data). Delivery logs make scheduled emails
-- idempotent: one alert per (recipient, contract end, threshold), one report per
-- (recipient, agency, month).

create type public.hr_report_kind as enum ('CONTRACT_ALERTS', 'MONTHLY_REPORT');

create table public.hr_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.hr_report_kind not null,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint hr_report_subscriptions_unique unique (profile_id, kind, agency_id)
);
create index hr_report_subscriptions_agency_idx on public.hr_report_subscriptions(agency_id, kind);
create index hr_report_subscriptions_created_by_idx on public.hr_report_subscriptions(created_by);

create table public.hr_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind public.hr_report_kind not null,
  dedupe_key text not null unique,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  provider_message_id text,
  created_at timestamptz not null default now(),
  check (length(dedupe_key) between 1 and 300)
);
create index hr_notification_deliveries_recipient_idx on public.hr_notification_deliveries(recipient_profile_id, created_at desc);

alter table public.hr_report_subscriptions enable row level security;
alter table public.hr_notification_deliveries enable row level security;
grant select on table public.hr_report_subscriptions to authenticated;
grant all privileges on table public.hr_report_subscriptions, public.hr_notification_deliveries to service_role;
create policy hr_report_subscriptions_select on public.hr_report_subscriptions for select to authenticated
using (profile_id = (select private.current_profile_id()) or (select private.is_global_reader()));

-- Scope rule shared by indicators and exports: client viewers are scoped by site only.
create function private.hr_profile_sees_record(p_profile_id uuid, p_role public.app_role, p_agency_id uuid, p_department_id uuid, p_site_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select case
    when p_role in ('hr_central', 'super_admin') then true
    when p_role = 'client_viewer' then private.hr_profile_scope_allows(p_profile_id, p_agency_id, null, p_site_id)
    when p_role = 'team_manager' then private.hr_profile_scope_allows(p_profile_id, p_agency_id, p_department_id, p_site_id)
    else false end
$$;
revoke all on function private.hr_profile_sees_record(uuid, public.app_role, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.hr_profile_sees_record(uuid, public.app_role, uuid, uuid, uuid) to service_role;

create function private.hr_dashboard_for(p_profile_id uuid, p_agency_id uuid, p_month date, p_today date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare v_role public.app_role; v_start date := date_trunc('month', p_month)::date; v_end date; v_result jsonb; v_hr boolean; v_client boolean;
begin
  select p.role into v_role from public.profiles p where p.id = p_profile_id and p.is_active;
  if v_role is null or v_role not in ('hr_central', 'super_admin', 'team_manager', 'client_viewer') then return null; end if;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_hr := v_role in ('hr_central', 'super_admin');
  v_client := v_role = 'client_viewer';
  with visible as (
    select r.*, e.full_name, e.employee_id as matricule, e.is_active as access_active
    from public.employee_hr_records r join public.employees e on e.id = r.employee_id join public.agencies a on a.id = r.agency_id and a.is_active
    where (p_agency_id is null or r.agency_id = p_agency_id) and private.hr_profile_sees_record(p_profile_id, v_role, r.agency_id, r.department_id, r.site_id)
  ), active as (
    select * from visible where status in ('ACTIVE', 'ON_LEAVE') and access_active and contract_start <= p_today and (contract_end is null or contract_end >= p_today)
  ), assigned as (
    select distinct a.employee_id from public.hr_assignments a join active on active.employee_id = a.employee_id
    where a.status = 'ACTIVE' and a.start_date <= p_today and (a.end_date is null or a.end_date >= p_today)
  ), absences as (
    select v.site_id, sum(public.hr_business_days(greatest(l.start_date, v_start), least(l.end_date, v_end)))::integer as days
    from public.leave_requests l join visible v on v.employee_id = l.employee_id
    where l.status = 'APPROVED' and l.start_date <= v_end and l.end_date >= v_start group by v.site_id
  ), needs as (
    select x.* from public.hr_replacements x join public.employee_hr_records r on r.employee_id = x.absent_employee_id
    where (p_agency_id is null or x.agency_id = p_agency_id) and x.status <> 'CANCELLED' and x.start_date <= v_end and x.end_date >= v_start
      and private.hr_profile_sees_record(p_profile_id, v_role, x.agency_id, r.department_id, x.site_id)
  ), sites as (
    select s.id, s.name, s.code from public.hr_sites s
    where (p_agency_id is null or s.agency_id = p_agency_id) and s.is_active
      and (v_hr or exists(select 1 from visible v where v.site_id = s.id) or (v_client and private.hr_profile_scope_allows(p_profile_id, s.agency_id, null, s.id)))
  )
  select jsonb_build_object(
    'period', jsonb_build_object('start', v_start, 'end', v_end, 'business_days', public.hr_business_days(v_start, v_end), 'today', p_today),
    'role', v_role,
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'site_id', s.id, 'site_name', s.name, 'site_code', s.code,
        'headcount', (select count(*) from active where active.site_id = s.id),
        'assigned', (select count(*) from active join assigned using (employee_id) where active.site_id = s.id),
        'absence_days', case when v_client then null else coalesce((select days from absences where absences.site_id = s.id), 0) end,
        'open_replacements', (select count(*) from needs where needs.site_id = s.id and needs.status = 'OPEN'),
        'confirmed_replacements', (select count(*) from needs where needs.site_id = s.id and needs.status = 'CONFIRMED'),
        'contracts_ending_30', (select count(*) from active where active.site_id = s.id and active.contract_end between p_today and p_today + 30)
      ) order by s.name) from sites s), '[]'::jsonb),
    'totals', jsonb_build_object(
      'headcount', (select count(*) from active),
      'assigned', (select count(*) from assigned),
      'entries', (select count(*) from visible where contract_start between v_start and v_end),
      'exits', (select count(*) from visible where contract_end between v_start and v_end),
      'absence_days', case when v_client then null else coalesce((select sum(days) from absences), 0) end,
      'open_replacements', (select count(*) from needs where status = 'OPEN'),
      'confirmed_replacements', (select count(*) from needs where status = 'CONFIRMED'),
      'avg_replacement_hours', (select round(avg(extract(epoch from (confirmed_at - created_at)) / 3600)::numeric, 1) from needs where status = 'CONFIRMED'),
      'contracts_ending_30', (select count(*) from active where contract_end between p_today and p_today + 30),
      'contracts_ending_60', (select count(*) from active where contract_end between p_today and p_today + 60),
      'contracts_ending_90', (select count(*) from active where contract_end between p_today and p_today + 90),
      'pending_leaves', case when v_client then null else (select count(*) from public.leave_requests l join visible v on v.employee_id = l.employee_id where l.status = 'PENDING') end),
    'hr', case when not v_hr then null else jsonb_build_object(
      'open_requests', (select count(*) from public.hr_requests q where (p_agency_id is null or q.agency_id = p_agency_id) and q.status = 'OPEN'),
      'in_progress_requests', (select count(*) from public.hr_requests q where (p_agency_id is null or q.agency_id = p_agency_id) and q.status = 'IN_PROGRESS'),
      'avg_resolution_hours', (select round(avg(extract(epoch from (q.replied_at - q.created_at)) / 3600)::numeric, 1) from public.hr_requests q
        where (p_agency_id is null or q.agency_id = p_agency_id) and q.status = 'RESOLVED' and q.replied_at::date between v_start and v_end),
      'cnaps_to_declare', (select count(*) from public.employee_private_details d join active on active.employee_id = d.employee_id where d.cnaps_status = 'TO_DECLARE'),
      'cnaps_to_regularize', (select count(*) from public.employee_private_details d join active on active.employee_id = d.employee_id where d.cnaps_status = 'TO_REGULARIZE'),
      'missing_files', (select count(*) from public.employees e join public.agencies a on a.id = e.agency_id and a.is_active
        where (p_agency_id is null or e.agency_id = p_agency_id) and e.is_active and not exists(select 1 from public.employee_hr_records r where r.employee_id = e.id))) end,
    'expiring', coalesce((select jsonb_agg(jsonb_build_object('employee_id', x.employee_id, 'full_name', x.full_name, 'matricule', x.matricule,
        'site_name', (select name from public.hr_sites where id = x.site_id), 'contract_type', x.contract_type, 'contract_end', x.contract_end,
        'days_left', x.contract_end - p_today) order by x.contract_end, x.full_name)
      from (select * from active where contract_end between p_today and p_today + 90 order by contract_end limit 100) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $fn$;
revoke all on function private.hr_dashboard_for(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function private.hr_dashboard_for(uuid, uuid, date, date) to service_role;

-- Browser-facing: indicators for the caller, as of today (UTC).
create function public.hr_dashboard(p_agency_id uuid default null, p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
  return private.hr_dashboard_for((select private.current_profile_id()), p_agency_id, coalesce(p_month, (now() at time zone 'UTC')::date), (now() at time zone 'UTC')::date);
end $fn$;
revoke all on function public.hr_dashboard(uuid, date) from public, anon;
grant execute on function public.hr_dashboard(uuid, date) to authenticated, service_role;

-- Server-only (scheduled reports): indicators computed for a recipient's own scope.
create function public.hr_dashboard_for_profile(p_profile_id uuid, p_agency_id uuid, p_month date, p_today date)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select private.hr_dashboard_for(p_profile_id, p_agency_id, p_month, p_today)
$$;
revoke all on function public.hr_dashboard_for_profile(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.hr_dashboard_for_profile(uuid, uuid, date, date) to service_role;

-- Approved leaves overlapping a period, with the business days inside it, for
-- the payroll provider (decision D5: manual export, no automatic transmission).
create function public.hr_export_approved_leaves(p_agency_id uuid, p_from date, p_to date)
returns table(matricule text, full_name text, site_name text, leave_type public.hr_leave_type, start_date date, end_date date, days_in_period integer, leave_request_id uuid)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
begin
  if not (select private.is_global_reader()) or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then return; end if;
  return query
  select e.employee_id, e.full_name, s.name, l.leave_type, l.start_date, l.end_date,
    public.hr_business_days(greatest(l.start_date, p_from), least(l.end_date, p_to)), l.id
  from public.leave_requests l join public.employees e on e.id = l.employee_id
  left join public.employee_hr_records r on r.employee_id = l.employee_id left join public.hr_sites s on s.id = r.site_id
  where l.status = 'APPROVED' and l.start_date <= p_to and l.end_date >= p_from and (p_agency_id is null or l.agency_id = p_agency_id)
  order by e.employee_id, l.start_date;
end $fn$;
revoke all on function public.hr_export_approved_leaves(uuid, date, date) from public, anon;
grant execute on function public.hr_export_approved_leaves(uuid, date, date) to authenticated, service_role;

-- Contract alerts due on p_today: thresholds 30/15/7 days, not yet delivered.
create function public.hr_contract_alerts_due(p_today date)
returns table(recipient_profile_id uuid, recipient_email text, recipient_name text, agency_id uuid, agency_name text, employee_id uuid, matricule text,
  full_name text, site_name text, contract_type public.hr_contract_type, contract_end date, threshold integer, dedupe_key text)
language sql stable security invoker set search_path = pg_catalog as $$
  select p.id, p.email, p.full_name, r.agency_id, a.name, e.id, e.employee_id, e.full_name, s.name, r.contract_type, r.contract_end, t.threshold,
    'alert:' || p.id || ':' || e.id || ':' || r.contract_end || ':' || t.threshold
  from public.hr_report_subscriptions sub
  join public.profiles p on p.id = sub.profile_id and p.is_active and p.role in ('hr_central', 'super_admin')
  join public.agencies a on a.id = sub.agency_id and a.is_active
  join public.employee_hr_records r on r.agency_id = sub.agency_id and r.status in ('ACTIVE', 'ON_LEAVE') and r.contract_end is not null
  join public.employees e on e.id = r.employee_id and e.is_active
  join public.hr_sites s on s.id = r.site_id
  cross join lateral (select min(x) as threshold from unnest(array[7, 15, 30]) x where r.contract_end - p_today between 0 and x) t
  where sub.kind = 'CONTRACT_ALERTS' and t.threshold is not null
    and not exists(select 1 from public.hr_notification_deliveries d where d.dedupe_key = 'alert:' || p.id || ':' || e.id || ':' || r.contract_end || ':' || t.threshold)
  order by p.id, r.contract_end, e.full_name
$$;
revoke all on function public.hr_contract_alerts_due(date) from public, anon, authenticated;
grant execute on function public.hr_contract_alerts_due(date) to service_role;

-- Subscriptions are recipient configuration: super administrators only.
create function public.admin_set_report_subscription(p_actor_id uuid, p_profile_id uuid, p_kind public.hr_report_kind, p_agency_id uuid, p_enabled boolean)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_target public.profiles;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role <> 'super_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_target from public.profiles where id = p_profile_id and is_active for share;
  if not found or p_kind is null or p_enabled is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if (p_kind = 'CONTRACT_ALERTS' and v_target.role not in ('hr_central', 'super_admin'))
    or (p_kind = 'MONTHLY_REPORT' and v_target.role not in ('hr_central', 'super_admin', 'team_manager', 'client_viewer'))
    or (v_target.role in ('team_manager', 'client_viewer') and not exists(select 1 from public.hr_scopes s where s.profile_id = v_target.id and s.agency_id = p_agency_id)) then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;
  perform 1 from public.agencies where id = p_agency_id for share;
  if not found then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_enabled then
    insert into public.hr_report_subscriptions(profile_id, kind, agency_id, created_by) values(p_profile_id, p_kind, p_agency_id, v_actor.id)
    on conflict on constraint hr_report_subscriptions_unique do nothing;
  else
    delete from public.hr_report_subscriptions where profile_id = p_profile_id and kind = p_kind and agency_id = p_agency_id;
  end if;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, p_agency_id, case when p_enabled then 'hr_report_subscription.enabled' else 'hr_report_subscription.disabled' end,
    'profile', p_profile_id, jsonb_build_object('kind', p_kind));
end $$;
revoke all on function public.admin_set_report_subscription(uuid, uuid, public.hr_report_kind, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_report_subscription(uuid, uuid, public.hr_report_kind, uuid, boolean) to service_role;
