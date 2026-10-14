-- Assignments (who works on which client site/team, over which period) and
-- replacements (a need created when a leave is approved, then a confirmed
-- available colleague). Overlaps are refused by exclusion constraints, so two
-- simultaneous writes cannot both succeed. Reads go through scoped functions:
-- client viewers see operational data of their sites, never leave reasons.

create type public.hr_assignment_status as enum ('PLANNED', 'ACTIVE', 'ENDED');
create type public.hr_replacement_status as enum ('OPEN', 'CONFIRMED', 'CANCELLED');

create table public.hr_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  employee_id uuid not null,
  site_id uuid not null,
  team_id uuid,
  start_date date not null,
  end_date date,
  status public.hr_assignment_status not null,
  created_by uuid not null references public.profiles(id),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_assignments_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint hr_assignments_site_agency_fk foreign key (site_id, agency_id) references public.hr_sites(id, agency_id),
  constraint hr_assignments_team_site_fk foreign key (team_id, site_id) references public.hr_teams(id, site_id),
  constraint hr_assignments_period check (end_date is null or end_date >= start_date),
  constraint hr_assignments_ended_has_end check (status <> 'ENDED' or end_date is not null),
  constraint hr_assignments_no_overlap exclude using gist (employee_id with =, daterange(start_date, end_date, '[]') with &&) where (status <> 'ENDED'),
  check (revision > 0)
);
create index hr_assignments_agency_site_idx on public.hr_assignments(agency_id, site_id, status);
create index hr_assignments_employee_idx on public.hr_assignments(employee_id, start_date desc);
create index hr_assignments_team_idx on public.hr_assignments(team_id, site_id);
create index hr_assignments_created_by_idx on public.hr_assignments(created_by);

create table public.hr_replacements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  leave_request_id uuid not null unique references public.leave_requests(id) on delete cascade,
  absent_employee_id uuid not null,
  replacement_employee_id uuid,
  site_id uuid not null,
  start_date date not null,
  end_date date not null,
  status public.hr_replacement_status not null default 'OPEN',
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  constraint hr_replacements_absent_agency_fk foreign key (absent_employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint hr_replacements_replacement_agency_fk foreign key (replacement_employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint hr_replacements_site_agency_fk foreign key (site_id, agency_id) references public.hr_sites(id, agency_id),
  constraint hr_replacements_period check (end_date >= start_date),
  constraint hr_replacements_distinct check (replacement_employee_id is null or replacement_employee_id <> absent_employee_id),
  constraint hr_replacements_confirmed_shape check ((status <> 'CONFIRMED' or (replacement_employee_id is not null and confirmed_at is not null)) and (status <> 'OPEN' or replacement_employee_id is null)),
  constraint hr_replacements_no_double_booking exclude using gist (replacement_employee_id with =, daterange(start_date, end_date, '[]') with &&) where (status = 'CONFIRMED'),
  check (revision > 0)
);
create index hr_replacements_agency_status_idx on public.hr_replacements(agency_id, status, start_date);
create index hr_replacements_absent_idx on public.hr_replacements(absent_employee_id, agency_id);
create index hr_replacements_replacement_idx on public.hr_replacements(replacement_employee_id, agency_id);
create index hr_replacements_site_idx on public.hr_replacements(site_id, agency_id);
create index hr_replacements_created_by_idx on public.hr_replacements(created_by);
create index hr_replacements_confirmed_by_idx on public.hr_replacements(confirmed_by);

alter table public.hr_assignments enable row level security;
alter table public.hr_replacements enable row level security;
grant all privileges on table public.hr_assignments, public.hr_replacements to service_role;
-- No direct client grant: reads go through hr_list_assignments / hr_list_replacements.

-- A contract change may not leave an open assignment or a confirmed replacement
-- outside the new contract period (whatever RPC updates the HR file).
create function private.hr_guard_contract_change() returns trigger language plpgsql security definer set search_path = pg_catalog as $fn$
begin
  if new.contract_start is distinct from old.contract_start or new.contract_end is distinct from old.contract_end then
    if exists(select 1 from public.hr_assignments a where a.employee_id = new.employee_id and a.status <> 'ENDED'
        and (a.start_date < new.contract_start or (new.contract_end is not null and (a.end_date is null or a.end_date > new.contract_end))))
      or exists(select 1 from public.hr_replacements r where r.replacement_employee_id = new.employee_id and r.status = 'CONFIRMED'
        and (r.start_date < new.contract_start or (new.contract_end is not null and r.end_date > new.contract_end))) then
      raise exception 'contract_conflict' using errcode = '22023';
    end if;
  end if;
  return new;
end $fn$;
create trigger employee_hr_records_contract_guard before update of contract_start, contract_end on public.employee_hr_records
for each row execute function private.hr_guard_contract_change();

create function public.hr_list_assignments(p_agency_id uuid default null, p_site_id uuid default null, p_status public.hr_assignment_status default null,
  p_employee_id uuid default null, p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, agency_id uuid, employee_id uuid, matricule text, full_name text, site_id uuid, site_name text, team_id uuid, team_name text,
  start_date date, end_date date, status public.hr_assignment_status, revision integer, total_count bigint)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
declare v_profile uuid := private.current_profile_id(); v_role public.app_role;
begin
  if v_profile is null then return; end if;
  select p.role into v_role from public.profiles p where p.id = v_profile;
  if v_role not in ('hr_central', 'super_admin', 'team_manager', 'client_viewer', 'employee') then return; end if;
  return query
  select a.id, a.agency_id, a.employee_id, e.employee_id, e.full_name, a.site_id, s.name, a.team_id, t.name, a.start_date, a.end_date, a.status, a.revision, count(*) over ()
  from public.hr_assignments a
  join public.employees e on e.id = a.employee_id
  join public.hr_sites s on s.id = a.site_id
  left join public.hr_teams t on t.id = a.team_id
  left join public.employee_hr_records r on r.employee_id = a.employee_id
  where (p_agency_id is null or a.agency_id = p_agency_id)
    and (p_site_id is null or a.site_id = p_site_id)
    and (p_status is null or a.status = p_status)
    and (p_employee_id is null or a.employee_id = p_employee_id)
    and case
      when v_role in ('hr_central', 'super_admin') then true
      when v_role = 'employee' then e.profile_id = v_profile and private.employee_access_active(e.id)
      when v_role = 'client_viewer' then private.hr_profile_scope_allows(v_profile, a.agency_id, null, a.site_id)
      else r.employee_id is not null and private.hr_profile_scope_allows(v_profile, a.agency_id, r.department_id, a.site_id)
    end
  order by case a.status when 'ACTIVE' then 0 when 'PLANNED' then 1 else 2 end, s.name, e.full_name, a.start_date
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $fn$;

create function public.hr_list_replacements(p_agency_id uuid default null, p_status public.hr_replacement_status default null, p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, agency_id uuid, leave_request_id uuid, site_id uuid, site_name text, absent_employee_id uuid, absent_name text,
  replacement_employee_id uuid, replacement_name text, start_date date, end_date date, status public.hr_replacement_status, revision integer, total_count bigint)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
declare v_profile uuid := private.current_profile_id(); v_role public.app_role;
begin
  if v_profile is null then return; end if;
  select p.role into v_role from public.profiles p where p.id = v_profile;
  if v_role not in ('hr_central', 'super_admin', 'team_manager', 'client_viewer', 'employee') then return; end if;
  return query
  select x.id, x.agency_id, x.leave_request_id, x.site_id, s.name, x.absent_employee_id, ab.full_name, x.replacement_employee_id, rp.full_name,
    x.start_date, x.end_date, x.status, x.revision, count(*) over ()
  from public.hr_replacements x
  join public.hr_sites s on s.id = x.site_id
  join public.employees ab on ab.id = x.absent_employee_id
  left join public.employees rp on rp.id = x.replacement_employee_id
  left join public.employee_hr_records r on r.employee_id = x.absent_employee_id
  where (p_agency_id is null or x.agency_id = p_agency_id)
    and (p_status is null or x.status = p_status)
    and case
      when v_role in ('hr_central', 'super_admin') then true
      when v_role = 'employee' then (ab.profile_id = v_profile and private.employee_access_active(ab.id)) or (rp.profile_id = v_profile and private.employee_access_active(rp.id))
      when v_role = 'client_viewer' then private.hr_profile_scope_allows(v_profile, x.agency_id, null, x.site_id)
      else r.employee_id is not null and private.hr_profile_scope_allows(v_profile, x.agency_id, r.department_id, x.site_id)
    end
  order by case x.status when 'OPEN' then 0 when 'CONFIRMED' then 1 else 2 end, x.start_date, x.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $fn$;

-- Active colleagues the caller may assign, under contract, free of approved or
-- pending leave and of another confirmed replacement over the period.
create function public.hr_replacement_candidates(p_replacement_id uuid)
returns table(employee_id uuid, matricule text, full_name text, job_title text, site_name text)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
declare v_profile uuid := private.current_profile_id(); v_need public.hr_replacements;
begin
  select * into v_need from public.hr_replacements where id = p_replacement_id;
  if v_profile is null or not found or not private.hr_profile_can_manage_employee(v_profile, v_need.absent_employee_id) then return; end if;
  return query
  select e.id, e.employee_id, e.full_name, r.job_title, s.name
  from public.employees e
  join public.employee_hr_records r on r.employee_id = e.id
  join public.hr_sites s on s.id = r.site_id
  where e.agency_id = v_need.agency_id and e.id <> v_need.absent_employee_id and e.is_active and r.status = 'ACTIVE'
    and r.contract_start <= v_need.start_date and (r.contract_end is null or r.contract_end >= v_need.end_date)
    and private.hr_profile_scope_allows(v_profile, e.agency_id, r.department_id, v_need.site_id)
    and not exists(select 1 from public.leave_requests l where l.employee_id = e.id and l.status in ('PENDING', 'APPROVED') and l.start_date <= v_need.end_date and l.end_date >= v_need.start_date)
    and not exists(select 1 from public.hr_replacements o where o.replacement_employee_id = e.id and o.status = 'CONFIRMED' and o.start_date <= v_need.end_date and o.end_date >= v_need.start_date)
  order by e.full_name
  limit 200;
end $fn$;

revoke all on function public.hr_list_assignments(uuid, uuid, public.hr_assignment_status, uuid, integer, integer) from public, anon;
revoke all on function public.hr_list_replacements(uuid, public.hr_replacement_status, integer, integer) from public, anon;
revoke all on function public.hr_replacement_candidates(uuid) from public, anon;
grant execute on function public.hr_list_assignments(uuid, uuid, public.hr_assignment_status, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.hr_list_replacements(uuid, public.hr_replacement_status, integer, integer) to authenticated, service_role;
grant execute on function public.hr_replacement_candidates(uuid) to authenticated, service_role;

-- Locks the actor (serializes with revocation/scope changes) and requires HR or team manager.
create function private.hr_require_team_writer(p_actor_id uuid)
returns public.profiles language plpgsql security definer set search_path = pg_catalog as $fn$
declare v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin', 'team_manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_actor;
end $fn$;
revoke all on function private.hr_require_team_writer(uuid) from public, anon, authenticated;
grant execute on function private.hr_require_team_writer(uuid) to service_role;

-- Creates (p_assignment_id null) or updates an assignment. The actor's scope must
-- cover the employee's department and the target site (old and new for a move).
create function public.hr_save_assignment(p_actor_id uuid, p_assignment_id uuid, p_employee_id uuid, p_site_id uuid, p_team_id uuid,
  p_start date, p_end date, p_status public.hr_assignment_status, p_revision integer)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_team_writer(p_actor_id); v_record public.employee_hr_records; v_before public.hr_assignments; v_old public.employee_hr_records; v_id uuid;
begin
  if p_start is null or p_status is null or (p_end is not null and p_end < p_start) or (p_status = 'ENDED' and p_end is null) then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_record from public.employee_hr_records where employee_id = p_employee_id for share;
  if not found then raise exception 'missing_hr_file' using errcode = '22023'; end if;
  if not private.hr_profile_scope_allows(v_actor.id, v_record.agency_id, v_record.department_id, p_site_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status <> 'ENDED' and v_record.status not in ('ACTIVE', 'ON_LEAVE') then raise exception 'inactive_employee' using errcode = '22023'; end if;
  if p_start < v_record.contract_start or (v_record.contract_end is not null and (p_end is null or p_end > v_record.contract_end)) then raise exception 'outside_contract' using errcode = '22023'; end if;
  perform 1 from public.hr_sites where id = p_site_id and agency_id = v_record.agency_id and is_active for share;
  if not found then raise exception 'inactive_site' using errcode = '22023'; end if;
  if p_team_id is not null then
    perform 1 from public.hr_teams where id = p_team_id and site_id = p_site_id and is_active for share;
    if not found then raise exception 'invalid_team' using errcode = '22023'; end if;
  end if;
  if p_assignment_id is null then
    insert into public.hr_assignments(agency_id, employee_id, site_id, team_id, start_date, end_date, status, created_by)
    values(v_record.agency_id, p_employee_id, p_site_id, p_team_id, p_start, p_end, p_status, v_actor.id) returning id into v_id;
  else
    select * into v_before from public.hr_assignments where id = p_assignment_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into v_old from public.employee_hr_records where employee_id = v_before.employee_id;
    if v_old.employee_id is null or not private.hr_profile_scope_allows(v_actor.id, v_before.agency_id, v_old.department_id, v_before.site_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    update public.hr_assignments set employee_id = p_employee_id, site_id = p_site_id, team_id = p_team_id, start_date = p_start, end_date = p_end,
      status = p_status, revision = revision + 1, updated_at = now() where id = p_assignment_id;
    v_id := p_assignment_id;
  end if;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_record.agency_id, p_employee_id, case when p_assignment_id is null then 'hr_assignment.created' else 'hr_assignment.updated' end,
    'hr_assignment', v_id, jsonb_build_object('site_id', p_site_id, 'team_id', p_team_id, 'status', p_status, 'previous_status', v_before.status, 'previous_site_id', v_before.site_id));
  return v_id;
exception when exclusion_violation then
  raise exception 'assignment_overlap' using errcode = 'PT409';
end $$;

-- Leave decisions may now open a replacement need in the same transaction.
drop function public.hr_decide_leave(uuid, uuid, boolean, text, integer);
create function public.hr_decide_leave(p_actor_id uuid, p_leave_id uuid, p_approve boolean, p_decision_reason text, p_revision integer, p_replacement_needed boolean)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_leave public.leave_requests; v_record public.employee_hr_records; v_balance public.leave_balances;
  v_reason text := nullif(btrim(p_decision_reason), '');
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin', 'team_manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_approve is null or p_replacement_needed is null or (not p_approve and v_reason is null) or length(v_reason) > 2000 or (not p_approve and p_replacement_needed) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_leave from public.leave_requests where id = p_leave_id for update;
  if not found or not private.hr_profile_can_manage_employee(v_actor.id, v_leave.employee_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_leave.revision is distinct from p_revision or v_leave.status <> 'PENDING' then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  if p_approve then
    v_record := private.hr_require_leave_eligibility(v_leave.employee_id, v_leave.start_date, v_leave.end_date);
    -- An absent employee cannot be booked as somebody's replacement over the same days.
    if exists(select 1 from public.hr_replacements o where o.replacement_employee_id = v_leave.employee_id and o.status = 'CONFIRMED'
      and o.start_date <= v_leave.end_date and o.end_date >= v_leave.start_date) then
      raise exception 'busy_replacing' using errcode = '22023';
    end if;
    if v_leave.leave_type = 'PAID_LEAVE' then
      v_balance := private.hr_lock_balance(v_leave.employee_id, v_leave.agency_id);
      if v_balance.balance_days < v_leave.days then raise exception 'insufficient_balance' using errcode = '22023'; end if;
      update public.leave_balances set balance_days = balance_days - v_leave.days, revision = revision + 1, updated_at = now() where employee_id = v_leave.employee_id;
      insert into public.leave_balance_movements(agency_id, employee_id, kind, days, balance_after, leave_request_id, actor_profile_id)
      values(v_leave.agency_id, v_leave.employee_id, 'APPROVAL_DEBIT', -v_leave.days, v_balance.balance_days - v_leave.days, v_leave.id, v_actor.id);
    end if;
    if p_replacement_needed then
      insert into public.hr_replacements(agency_id, leave_request_id, absent_employee_id, site_id, start_date, end_date, created_by)
      values(v_leave.agency_id, v_leave.id, v_leave.employee_id, v_record.site_id, v_leave.start_date, v_leave.end_date, v_actor.id);
    end if;
  end if;
  update public.leave_requests set status = case when p_approve then 'APPROVED'::public.hr_leave_status else 'REFUSED'::public.hr_leave_status end,
    decision_reason = v_reason, decided_by = v_actor.id, decided_at = now(), revision = revision + 1 where id = p_leave_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_leave.agency_id, v_leave.employee_id, case when p_approve then 'hr_leave.approved' else 'hr_leave.refused' end,
    'leave_request', p_leave_id, jsonb_build_object('leave_type', v_leave.leave_type, 'days', v_leave.days, 'replacement_needed', p_replacement_needed));
end $$;
revoke all on function public.hr_decide_leave(uuid, uuid, boolean, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.hr_decide_leave(uuid, uuid, boolean, text, integer, boolean) to service_role;

-- Cancelling a leave also closes its replacement need (open or confirmed).
create or replace function public.hr_cancel_leave(p_actor_id uuid, p_leave_id uuid, p_reason text, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_leave public.leave_requests; v_owner boolean; v_balance public.leave_balances; v_debit integer; v_replacement uuid;
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
  update public.hr_replacements set status = 'CANCELLED', revision = revision + 1 where leave_request_id = p_leave_id and status <> 'CANCELLED' returning id into v_replacement;
  update public.leave_requests set status = 'CANCELLED', decision_reason = btrim(p_reason), decided_by = v_actor.id, decided_at = now(), revision = revision + 1 where id = p_leave_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_leave.agency_id, v_leave.employee_id, 'hr_leave.cancelled', 'leave_request', p_leave_id,
    jsonb_build_object('previous_status', v_leave.status, 'credited_days', coalesce(v_debit, 0), 'replacement_cancelled', v_replacement));
end $$;

-- Confirms an available colleague for an open need. Rechecks every rule under
-- locks; the exclusion constraint refuses a concurrent double booking.
create function public.hr_confirm_replacement(p_actor_id uuid, p_replacement_id uuid, p_replacement_employee_id uuid, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_team_writer(p_actor_id); v_need public.hr_replacements; v_candidate public.employee_hr_records;
begin
  select * into v_need from public.hr_replacements where id = p_replacement_id for update;
  if not found or not private.hr_profile_can_manage_employee(v_actor.id, v_need.absent_employee_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_need.revision is distinct from p_revision or v_need.status <> 'OPEN' then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  perform 1 from public.leave_requests where id = v_need.leave_request_id and status = 'APPROVED' for share;
  if not found then raise exception 'leave_not_approved' using errcode = 'PT409'; end if;
  if p_replacement_employee_id is null or p_replacement_employee_id = v_need.absent_employee_id then raise exception 'invalid_candidate' using errcode = '22023'; end if;
  select * into v_candidate from public.employee_hr_records where employee_id = p_replacement_employee_id for share;
  if not found or v_candidate.agency_id <> v_need.agency_id or v_candidate.status <> 'ACTIVE'
    or not private.hr_profile_scope_allows(v_actor.id, v_candidate.agency_id, v_candidate.department_id, v_need.site_id)
    or v_candidate.contract_start > v_need.start_date or (v_candidate.contract_end is not null and v_candidate.contract_end < v_need.end_date) then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  perform 1 from public.employees where id = p_replacement_employee_id and is_active for share;
  if not found then raise exception 'invalid_candidate' using errcode = '22023'; end if;
  -- Leaves of the candidate are locked so a concurrent approval cannot slip in.
  perform 1 from public.leave_requests where employee_id = p_replacement_employee_id for share;
  if exists(select 1 from public.leave_requests l where l.employee_id = p_replacement_employee_id and l.status in ('PENDING', 'APPROVED')
    and l.start_date <= v_need.end_date and l.end_date >= v_need.start_date) then
    raise exception 'candidate_absent' using errcode = '22023';
  end if;
  update public.hr_replacements set replacement_employee_id = p_replacement_employee_id, status = 'CONFIRMED', confirmed_by = v_actor.id, confirmed_at = now(), revision = revision + 1
  where id = p_replacement_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_need.agency_id, v_need.absent_employee_id, 'hr_replacement.confirmed', 'hr_replacement', p_replacement_id,
    jsonb_build_object('replacement_employee_id', p_replacement_employee_id, 'site_id', v_need.site_id));
exception when exclusion_violation then
  raise exception 'candidate_busy' using errcode = 'PT409';
end $$;

create function public.hr_cancel_replacement(p_actor_id uuid, p_replacement_id uuid, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_team_writer(p_actor_id); v_need public.hr_replacements;
begin
  select * into v_need from public.hr_replacements where id = p_replacement_id for update;
  if not found or not private.hr_profile_can_manage_employee(v_actor.id, v_need.absent_employee_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_need.revision is distinct from p_revision or v_need.status = 'CANCELLED' then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  update public.hr_replacements set status = 'CANCELLED', revision = revision + 1 where id = p_replacement_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_need.agency_id, v_need.absent_employee_id, 'hr_replacement.cancelled', 'hr_replacement', p_replacement_id,
    jsonb_build_object('previous_status', v_need.status));
end $$;

revoke all on function public.hr_save_assignment(uuid, uuid, uuid, uuid, uuid, date, date, public.hr_assignment_status, integer) from public, anon, authenticated;
revoke all on function public.hr_confirm_replacement(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.hr_cancel_replacement(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.hr_save_assignment(uuid, uuid, uuid, uuid, uuid, date, date, public.hr_assignment_status, integer) to service_role;
grant execute on function public.hr_confirm_replacement(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.hr_cancel_replacement(uuid, uuid, integer) to service_role;
