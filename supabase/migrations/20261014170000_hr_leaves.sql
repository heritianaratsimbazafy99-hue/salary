-- Leave and absence management. The HR module owns leave balances (payroll has
-- none; its ABSENCE items are amounts only). Business days are Monday-Friday;
-- public holidays and accrual are not computed.
-- Guarantees enforced by the database, not only by code:
--  * no overlapping PENDING/APPROVED requests per employee (exclusion constraint);
--  * one approval debit per leave (unique movement) and a balance never below 0;
--  * decision, debit and audit commit together or not at all.

create extension if not exists btree_gist with schema extensions;

create type public.hr_leave_type as enum ('PAID_LEAVE', 'AUTHORIZED_ABSENCE');
create type public.hr_leave_status as enum ('PENDING', 'APPROVED', 'REFUSED', 'CANCELLED');
create type public.hr_balance_movement_kind as enum ('INITIAL', 'ADJUSTMENT', 'APPROVAL_DEBIT', 'CANCELLATION_CREDIT');

create table public.leave_balances (
  employee_id uuid primary key,
  agency_id uuid not null,
  balance_days integer not null default 0,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint leave_balances_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint leave_balances_nonnegative check (balance_days >= 0),
  check (revision > 0)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  employee_id uuid not null,
  leave_type public.hr_leave_type not null,
  start_date date not null,
  end_date date not null,
  days integer not null,
  reason text not null,
  status public.hr_leave_status not null default 'PENDING',
  decision_reason text,
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint leave_requests_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint leave_requests_period check (end_date >= start_date and end_date - start_date <= 366),
  constraint leave_requests_days check (days > 0),
  constraint leave_requests_reason check (length(btrim(reason)) between 1 and 2000),
  constraint leave_requests_decision_reason check (decision_reason is null or length(btrim(decision_reason)) between 1 and 2000),
  constraint leave_requests_no_overlap exclude using gist (employee_id with =, daterange(start_date, end_date, '[]') with &&) where (status in ('PENDING', 'APPROVED')),
  check (revision > 0)
);
create index leave_requests_agency_status_idx on public.leave_requests(agency_id, status, start_date);
create index leave_requests_employee_idx on public.leave_requests(employee_id, start_date desc);
create index leave_requests_requested_by_idx on public.leave_requests(requested_by);
create index leave_requests_decided_by_idx on public.leave_requests(decided_by);

create table public.leave_balance_movements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  employee_id uuid not null,
  kind public.hr_balance_movement_kind not null,
  days integer not null,
  balance_after integer not null,
  leave_request_id uuid references public.leave_requests(id) on delete cascade,
  reason text,
  actor_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint leave_balance_movements_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint leave_balance_movements_once_per_leave unique (leave_request_id, kind),
  constraint leave_balance_movements_shape check (
    (kind in ('APPROVAL_DEBIT', 'CANCELLATION_CREDIT') and leave_request_id is not null)
    or (kind in ('INITIAL', 'ADJUSTMENT') and leave_request_id is null and reason is not null and length(btrim(reason)) between 3 and 2000)),
  check (days <> 0 and balance_after >= 0)
);
create index leave_balance_movements_employee_idx on public.leave_balance_movements(employee_id, created_at desc);
create index leave_balance_movements_actor_idx on public.leave_balance_movements(actor_profile_id);

alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_balance_movements enable row level security;
grant select on table public.leave_balances, public.leave_balance_movements to authenticated;
grant all privileges on table public.leave_balances, public.leave_requests, public.leave_balance_movements to service_role;

-- Live check: the employee's HR file falls within the profile's scope.
create function private.hr_profile_can_manage_employee(p_profile_id uuid, p_employee_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare v_record public.employee_hr_records;
begin
  select * into v_record from public.employee_hr_records where employee_id = p_employee_id;
  if not found then
    return exists(select 1 from public.profiles p where p.id = p_profile_id and p.is_active and p.role in ('hr_central', 'super_admin'));
  end if;
  return exists(select 1 from public.profiles p where p.id = p_profile_id and p.is_active and p.role in ('hr_central', 'super_admin', 'team_manager'))
    and private.hr_profile_scope_allows(p_profile_id, v_record.agency_id, v_record.department_id, v_record.site_id);
end $fn$;
-- Executable by authenticated because the leave_balances policy calls it; the
-- private schema is not exposed by the API.
revoke all on function private.hr_profile_can_manage_employee(uuid, uuid) from public, anon;
grant execute on function private.hr_profile_can_manage_employee(uuid, uuid) to authenticated, service_role;

-- Balances carry no private text: HR, the employee and in-scope team managers.
create policy leave_balances_select_scoped on public.leave_balances for select to authenticated
using ((select private.is_global_reader())
  or ((select private.current_app_role()) = 'employee' and private.employee_access_active(employee_id))
  or ((select private.current_app_role()) = 'team_manager' and private.hr_profile_can_manage_employee((select private.current_profile_id()), employee_id)));
-- The movement history (with HR reasons) stays between HR and the employee.
create policy leave_balance_movements_select_hr_or_self on public.leave_balance_movements for select to authenticated
using ((select private.is_global_reader())
  or ((select private.current_app_role()) = 'employee' and private.employee_access_active(employee_id)));
-- leave_requests has no direct client grant: reads go through hr_list_leaves,
-- which withholds the employee's reason and the decision reason from managers.

create function public.hr_business_days(p_start date, p_end date)
returns integer language sql immutable set search_path = pg_catalog as $$
  select count(*)::integer from generate_series(p_start, p_end, interval '1 day') d where extract(isodow from d) < 6
$$;
grant execute on function public.hr_business_days(date, date) to authenticated, service_role;

create function public.hr_list_leaves(p_agency_id uuid default null, p_employee_id uuid default null, p_status public.hr_leave_status default null,
  p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, agency_id uuid, employee_id uuid, matricule text, full_name text, site_name text, leave_type public.hr_leave_type,
  start_date date, end_date date, days integer, status public.hr_leave_status, reason text, decision_reason text, decided_by_name text,
  decided_at timestamptz, created_at timestamptz, revision integer, balance_days integer, total_count bigint)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
declare v_profile uuid := private.current_profile_id(); v_role public.app_role;
begin
  if v_profile is null then return; end if;
  select p.role into v_role from public.profiles p where p.id = v_profile;
  if v_role not in ('hr_central', 'super_admin', 'team_manager', 'employee') then return; end if;
  return query
  select l.id, l.agency_id, l.employee_id, e.employee_id, e.full_name, s.name, l.leave_type, l.start_date, l.end_date, l.days, l.status,
    case when v_role <> 'team_manager' then l.reason end,
    case when v_role <> 'team_manager' then l.decision_reason end,
    d.full_name, l.decided_at, l.created_at, l.revision, b.balance_days, count(*) over ()
  from public.leave_requests l
  join public.employees e on e.id = l.employee_id
  left join public.employee_hr_records r on r.employee_id = l.employee_id
  left join public.hr_sites s on s.id = r.site_id
  left join public.profiles d on d.id = l.decided_by
  left join public.leave_balances b on b.employee_id = l.employee_id
  where (p_agency_id is null or l.agency_id = p_agency_id)
    and (p_employee_id is null or l.employee_id = p_employee_id)
    and (p_status is null or l.status = p_status)
    and case
      when v_role in ('hr_central', 'super_admin') then true
      when v_role = 'employee' then e.profile_id = v_profile and private.employee_access_active(e.id)
      else r.employee_id is not null and private.hr_profile_scope_allows(v_profile, r.agency_id, r.department_id, r.site_id)
    end
  order by case when l.status = 'PENDING' then 0 else 1 end, l.start_date desc, l.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $fn$;
revoke all on function public.hr_list_leaves(uuid, uuid, public.hr_leave_status, integer, integer) from public, anon;
grant execute on function public.hr_list_leaves(uuid, uuid, public.hr_leave_status, integer, integer) to authenticated, service_role;

-- Locks and returns the balance row, creating it at 0 when missing.
create function private.hr_lock_balance(p_employee_id uuid, p_agency_id uuid)
returns public.leave_balances language plpgsql security definer set search_path = pg_catalog as $fn$
declare v_balance public.leave_balances;
begin
  insert into public.leave_balances(employee_id, agency_id) values(p_employee_id, p_agency_id) on conflict (employee_id) do nothing;
  select * into v_balance from public.leave_balances where employee_id = p_employee_id for update;
  return v_balance;
end $fn$;
revoke all on function private.hr_lock_balance(uuid, uuid) from public, anon, authenticated;
grant execute on function private.hr_lock_balance(uuid, uuid) to service_role;

-- Contract and status checks shared by creation and approval.
create function private.hr_require_leave_eligibility(p_employee_id uuid, p_start date, p_end date)
returns public.employee_hr_records language plpgsql security definer set search_path = pg_catalog as $fn$
declare v_record public.employee_hr_records;
begin
  select * into v_record from public.employee_hr_records where employee_id = p_employee_id for share;
  if not found then raise exception 'missing_hr_file' using errcode = '22023'; end if;
  if v_record.status not in ('ACTIVE', 'ON_LEAVE') then raise exception 'inactive_employee' using errcode = '22023'; end if;
  if p_start < v_record.contract_start or (v_record.contract_end is not null and p_end > v_record.contract_end) then
    raise exception 'outside_contract' using errcode = '22023';
  end if;
  perform 1 from public.employees where id = p_employee_id and is_active for share;
  if not found then raise exception 'inactive_employee' using errcode = '22023'; end if;
  return v_record;
end $fn$;
revoke all on function private.hr_require_leave_eligibility(uuid, date, date) from public, anon, authenticated;
grant execute on function private.hr_require_leave_eligibility(uuid, date, date) to service_role;

-- HR sets an initial balance or records a motivated correction.
create function public.hr_adjust_leave_balance(p_actor_id uuid, p_employee_id uuid, p_kind public.hr_balance_movement_kind, p_days integer, p_reason text, p_revision integer)
returns integer language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_employee public.employees; v_balance public.leave_balances; v_after integer;
begin
  if p_kind not in ('INITIAL', 'ADJUSTMENT') or p_days is null or p_days = 0 or abs(p_days) > 366 or p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_employee from public.employees where id = p_employee_id for share;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_balance := private.hr_lock_balance(p_employee_id, v_employee.agency_id);
  if v_balance.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  v_after := v_balance.balance_days + p_days;
  if v_after < 0 then raise exception 'negative_balance' using errcode = '22023'; end if;
  update public.leave_balances set balance_days = v_after, revision = revision + 1, updated_at = now() where employee_id = p_employee_id;
  insert into public.leave_balance_movements(agency_id, employee_id, kind, days, balance_after, reason, actor_profile_id)
  values(v_employee.agency_id, p_employee_id, p_kind, p_days, v_after, btrim(p_reason), v_actor.id);
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_employee.agency_id, p_employee_id, 'hr_leave_balance.adjusted', 'employee', p_employee_id,
    jsonb_build_object('kind', p_kind, 'days', p_days, 'balance_after', v_after));
  return v_after;
end $$;

-- HR, or the employee for themselves. Team managers do not file personal requests.
create function public.hr_create_leave(p_actor_id uuid, p_employee_id uuid, p_leave_type public.hr_leave_type, p_start date, p_end date, p_reason text)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_record public.employee_hr_records; v_balance public.leave_balances; v_days integer; v_id uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or not (v_actor.role in ('hr_central', 'super_admin')
    or (v_actor.role = 'employee' and exists(select 1 from public.employees e join public.agencies a on a.id = e.agency_id
      where e.id = p_employee_id and e.profile_id = v_actor.id and e.is_active and a.is_active))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_leave_type is null or p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_days := public.hr_business_days(p_start, p_end);
  if v_days = 0 then raise exception 'no_business_day' using errcode = '22023'; end if;
  v_record := private.hr_require_leave_eligibility(p_employee_id, p_start, p_end);
  if p_leave_type = 'PAID_LEAVE' then
    v_balance := private.hr_lock_balance(p_employee_id, v_record.agency_id);
    if v_balance.balance_days < v_days then raise exception 'insufficient_balance' using errcode = '22023'; end if;
  end if;
  insert into public.leave_requests(agency_id, employee_id, leave_type, start_date, end_date, days, reason, requested_by)
  values(v_record.agency_id, p_employee_id, p_leave_type, p_start, p_end, v_days, btrim(p_reason), v_actor.id) returning id into v_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_record.agency_id, p_employee_id, 'hr_leave.requested', 'leave_request', v_id,
    jsonb_build_object('leave_type', p_leave_type, 'start_date', p_start, 'end_date', p_end, 'days', v_days));
  return v_id;
exception when exclusion_violation then
  raise exception 'leave_overlap' using errcode = 'PT409';
end $$;

-- Approval or refusal by HR or an in-scope team manager. The actor profile is
-- locked FOR SHARE, so a concurrent revocation or scope change serializes.
create function public.hr_decide_leave(p_actor_id uuid, p_leave_id uuid, p_approve boolean, p_decision_reason text, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_leave public.leave_requests; v_record public.employee_hr_records; v_balance public.leave_balances;
  v_reason text := nullif(btrim(p_decision_reason), '');
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin', 'team_manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_approve is null or (not p_approve and v_reason is null) or length(v_reason) > 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_leave from public.leave_requests where id = p_leave_id for update;
  if not found or not private.hr_profile_can_manage_employee(v_actor.id, v_leave.employee_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_leave.revision is distinct from p_revision or v_leave.status <> 'PENDING' then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  if p_approve then
    v_record := private.hr_require_leave_eligibility(v_leave.employee_id, v_leave.start_date, v_leave.end_date);
    if v_leave.leave_type = 'PAID_LEAVE' then
      v_balance := private.hr_lock_balance(v_leave.employee_id, v_leave.agency_id);
      if v_balance.balance_days < v_leave.days then raise exception 'insufficient_balance' using errcode = '22023'; end if;
      update public.leave_balances set balance_days = balance_days - v_leave.days, revision = revision + 1, updated_at = now() where employee_id = v_leave.employee_id;
      insert into public.leave_balance_movements(agency_id, employee_id, kind, days, balance_after, leave_request_id, actor_profile_id)
      values(v_leave.agency_id, v_leave.employee_id, 'APPROVAL_DEBIT', -v_leave.days, v_balance.balance_days - v_leave.days, v_leave.id, v_actor.id);
    end if;
  end if;
  update public.leave_requests set status = case when p_approve then 'APPROVED'::public.hr_leave_status else 'REFUSED'::public.hr_leave_status end,
    decision_reason = v_reason, decided_by = v_actor.id, decided_at = now(), revision = revision + 1 where id = p_leave_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_leave.agency_id, v_leave.employee_id, case when p_approve then 'hr_leave.approved' else 'hr_leave.refused' end,
    'leave_request', p_leave_id, jsonb_build_object('leave_type', v_leave.leave_type, 'days', v_leave.days));
end $$;

-- The employee withdraws a pending request; HR may also cancel an approved one,
-- which credits the debited days back exactly once.
create function public.hr_cancel_leave(p_actor_id uuid, p_leave_id uuid, p_reason text, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_leave public.leave_requests; v_owner boolean; v_balance public.leave_balances; v_debit integer;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_leave from public.leave_requests where id = p_leave_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_owner := v_actor.role = 'employee' and exists(select 1 from public.employees e where e.id = v_leave.employee_id and e.profile_id = v_actor.id and e.is_active);
  if not (v_actor.role in ('hr_central', 'super_admin') or (v_owner and v_leave.status = 'PENDING')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_leave.revision is distinct from p_revision or v_leave.status not in ('PENDING', 'APPROVED') then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  select -days into v_debit from public.leave_balance_movements where leave_request_id = p_leave_id and kind = 'APPROVAL_DEBIT';
  if v_debit is not null then
    v_balance := private.hr_lock_balance(v_leave.employee_id, v_leave.agency_id);
    update public.leave_balances set balance_days = balance_days + v_debit, revision = revision + 1, updated_at = now() where employee_id = v_leave.employee_id;
    insert into public.leave_balance_movements(agency_id, employee_id, kind, days, balance_after, leave_request_id, reason, actor_profile_id)
    values(v_leave.agency_id, v_leave.employee_id, 'CANCELLATION_CREDIT', v_debit, v_balance.balance_days + v_debit, p_leave_id, btrim(p_reason), v_actor.id);
  end if;
  update public.leave_requests set status = 'CANCELLED', decision_reason = btrim(p_reason), decided_by = v_actor.id, decided_at = now(), revision = revision + 1 where id = p_leave_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_leave.agency_id, v_leave.employee_id, 'hr_leave.cancelled', 'leave_request', p_leave_id,
    jsonb_build_object('previous_status', v_leave.status, 'credited_days', coalesce(v_debit, 0)));
end $$;

revoke all on function public.hr_adjust_leave_balance(uuid, uuid, public.hr_balance_movement_kind, integer, text, integer) from public, anon, authenticated;
revoke all on function public.hr_create_leave(uuid, uuid, public.hr_leave_type, date, date, text) from public, anon, authenticated;
revoke all on function public.hr_decide_leave(uuid, uuid, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.hr_cancel_leave(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.hr_adjust_leave_balance(uuid, uuid, public.hr_balance_movement_kind, integer, text, integer) to service_role;
grant execute on function public.hr_create_leave(uuid, uuid, public.hr_leave_type, date, date, text) to service_role;
grant execute on function public.hr_decide_leave(uuid, uuid, boolean, text, integer) to service_role;
grant execute on function public.hr_cancel_leave(uuid, uuid, text, integer) to service_role;
