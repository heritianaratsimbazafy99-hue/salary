-- HR employee files on top of the existing payroll employees (same id, same
-- (agency_id, employee_id) business key). Identity (name, email) stays owned by
-- payroll imports; HR owns job, organisation, contract, private contacts and CNAPS.
-- Private contacts and CNAPS live in a separate table because RLS filters rows,
-- not columns: managers and client viewers must never be able to select them.

create type public.hr_employee_status as enum ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'CONTRACT_ENDED');
-- INTERIM and MISSION may have an imprecise term (e.g. replacement): only a CDD requires an end date.
create type public.hr_contract_type as enum ('CDI', 'CDD', 'INTERIM', 'MISSION');
create type public.hr_cnaps_status as enum ('TO_DECLARE', 'DECLARED', 'TO_REGULARIZE');

alter table public.hr_teams add constraint hr_teams_id_site_id_key unique (id, site_id);

create table public.employee_hr_records (
  employee_id uuid primary key,
  agency_id uuid not null,
  job_title text not null,
  department_id uuid not null,
  site_id uuid not null,
  team_id uuid,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  status public.hr_employee_status not null default 'ACTIVE',
  contract_type public.hr_contract_type not null,
  contract_start date not null,
  contract_end date,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_hr_records_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint employee_hr_records_department_agency_fk foreign key (department_id, agency_id) references public.hr_departments(id, agency_id),
  constraint employee_hr_records_site_agency_fk foreign key (site_id, agency_id) references public.hr_sites(id, agency_id),
  constraint employee_hr_records_team_site_fk foreign key (team_id, site_id) references public.hr_teams(id, site_id),
  constraint employee_hr_records_contract_dates check (
    (contract_type <> 'CDD' and (contract_end is null or contract_end >= contract_start))
    or (contract_type = 'CDD' and contract_end is not null and contract_end >= contract_start)
  ),
  check (length(btrim(job_title)) between 1 and 160),
  check (revision > 0)
);
create index employee_hr_records_agency_site_idx on public.employee_hr_records(agency_id, site_id);
create index employee_hr_records_agency_department_idx on public.employee_hr_records(agency_id, department_id);
create index employee_hr_records_team_idx on public.employee_hr_records(team_id, site_id);
create index employee_hr_records_manager_idx on public.employee_hr_records(manager_profile_id);
create index employee_hr_records_contract_end_idx on public.employee_hr_records(contract_end) where contract_end is not null;

create table public.employee_private_details (
  employee_id uuid primary key,
  agency_id uuid not null,
  personal_email text,
  personal_phone text,
  postal_address text,
  emergency_contact text,
  cnaps_number text,
  cnaps_status public.hr_cnaps_status not null default 'TO_DECLARE',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_private_details_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint employee_private_details_cnaps_declared check (cnaps_status <> 'DECLARED' or cnaps_number is not null),
  check (personal_email is null or (personal_email = lower(personal_email) and length(personal_email) <= 254 and position('@' in personal_email) > 1)),
  check (personal_phone is null or length(personal_phone) between 1 and 40),
  check (postal_address is null or length(postal_address) between 1 and 500),
  check (emergency_contact is null or length(emergency_contact) between 1 and 300),
  check (cnaps_number is null or length(btrim(cnaps_number)) between 1 and 80),
  check (revision > 0)
);

alter table public.employee_hr_records enable row level security;
alter table public.employee_private_details enable row level security;
grant select on table public.employee_hr_records, public.employee_private_details to authenticated;
grant all privileges on table public.employee_hr_records, public.employee_private_details to service_role;

-- Direct reads: HR only for operational records (other roles use the scoped
-- directory below); private details for HR and the employee concerned.
create policy employee_hr_records_select_global on public.employee_hr_records for select to authenticated
using ((select private.is_global_reader()));
create policy employee_private_details_select_hr_or_self on public.employee_private_details for select to authenticated
using ((select private.is_global_reader()) or ((select private.current_app_role()) = 'employee' and private.employee_access_active(employee_id)));

-- Operational directory: only non-private columns, filtered by the caller's live
-- role and scope. Team managers and client viewers do not receive email,
-- contacts, CNAPS, balances or documents. Employees only receive themselves.
create function public.hr_employee_directory(
  p_agency_id uuid default null, p_search text default null, p_site_id uuid default null, p_department_id uuid default null,
  p_status public.hr_employee_status default null, p_employee_id uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table(employee_id uuid, agency_id uuid, matricule text, full_name text, has_record boolean, job_title text,
  department_id uuid, department_name text, site_id uuid, site_name text, team_id uuid, team_name text, manager_profile_id uuid, manager_name text,
  status public.hr_employee_status, contract_type public.hr_contract_type, contract_start date, contract_end date, revision integer, total_count bigint)
language plpgsql stable security definer set search_path = pg_catalog as $fn$
#variable_conflict use_column
declare v_profile uuid := private.current_profile_id(); v_role public.app_role; v_search text;
begin
  if v_profile is null then return; end if;
  select p.role into v_role from public.profiles p where p.id = v_profile;
  if v_role is null or v_role = 'agency_manager' then return; end if;
  v_search := nullif(btrim(left(p_search, 160)), '');
  v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select e.id, e.agency_id, e.employee_id, e.full_name, r.employee_id is not null, r.job_title,
    r.department_id, d.name, r.site_id, s.name, r.team_id, t.name, r.manager_profile_id, m.full_name,
    r.status, r.contract_type, r.contract_start, r.contract_end, r.revision, count(*) over ()
  from public.employees e
  left join public.employee_hr_records r on r.employee_id = e.id
  left join public.hr_departments d on d.id = r.department_id
  left join public.hr_sites s on s.id = r.site_id
  left join public.hr_teams t on t.id = r.team_id
  left join public.profiles m on m.id = r.manager_profile_id
  where (p_agency_id is null or e.agency_id = p_agency_id)
    and (p_employee_id is null or e.id = p_employee_id)
    and (p_site_id is null or r.site_id = p_site_id)
    and (p_department_id is null or r.department_id = p_department_id)
    and (p_status is null or r.status = p_status)
    and (v_search is null or e.full_name ilike '%' || v_search || '%' or e.employee_id ilike '%' || v_search || '%')
    and case
      when v_role in ('hr_central', 'super_admin') then true
      when v_role = 'employee' then e.profile_id = v_profile and private.employee_access_active(e.id)
      when v_role in ('team_manager', 'client_viewer') then r.employee_id is not null and private.hr_profile_scope_allows(v_profile, e.agency_id, r.department_id, r.site_id)
      else false
    end
  order by e.full_name, e.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $fn$;
revoke all on function public.hr_employee_directory(uuid, text, uuid, uuid, public.hr_employee_status, uuid, integer, integer) from public, anon;
grant execute on function public.hr_employee_directory(uuid, text, uuid, uuid, public.hr_employee_status, uuid, integer, integer) to authenticated, service_role;

-- Shared validation for HR record writes; raises on any invalid reference.
create function private.hr_validate_record(p_agency_id uuid, p_job_title text, p_department_id uuid, p_site_id uuid, p_team_id uuid,
  p_manager_profile_id uuid, p_status public.hr_employee_status, p_contract_type public.hr_contract_type, p_contract_start date, p_contract_end date)
returns void language plpgsql security definer set search_path = pg_catalog as $fn$
begin
  if p_job_title is null or length(btrim(p_job_title)) not between 1 and 160 or p_status is null or p_contract_type is null or p_contract_start is null
    or (p_contract_type = 'CDD' and p_contract_end is null) or (p_contract_end is not null and p_contract_end < p_contract_start) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform 1 from public.hr_departments where id = p_department_id and agency_id = p_agency_id and is_active for share;
  if not found then raise exception 'invalid_department' using errcode = '22023'; end if;
  perform 1 from public.hr_sites where id = p_site_id and agency_id = p_agency_id and is_active for share;
  if not found then raise exception 'inactive_site' using errcode = '22023'; end if;
  if p_team_id is not null then
    perform 1 from public.hr_teams where id = p_team_id and site_id = p_site_id and is_active for share;
    if not found then raise exception 'invalid_team' using errcode = '22023'; end if;
  end if;
  if p_manager_profile_id is not null then
    perform 1 from public.profiles p where p.id = p_manager_profile_id and p.is_active and p.role = 'team_manager'
      and exists(select 1 from public.hr_scopes s where s.profile_id = p.id and s.agency_id = p_agency_id) for share of p;
    if not found then raise exception 'invalid_manager' using errcode = '22023'; end if;
  end if;
end $fn$;
revoke all on function private.hr_validate_record(uuid, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date) from public, anon, authenticated;
grant execute on function private.hr_validate_record(uuid, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date) to service_role;

create function private.hr_require_hr_actor(p_actor_id uuid)
returns public.profiles language plpgsql security definer set search_path = pg_catalog as $fn$
declare v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_actor;
end $fn$;
revoke all on function private.hr_require_hr_actor(uuid) from public, anon, authenticated;
grant execute on function private.hr_require_hr_actor(uuid) to service_role;

-- New person not yet present in payroll. A later payroll import with the same
-- matricule updates the same employees row (name/email) and never the HR file.
create function public.hr_create_employee(p_actor_id uuid, p_agency_id uuid, p_matricule text, p_email text, p_full_name text,
  p_job_title text, p_department_id uuid, p_site_id uuid, p_team_id uuid, p_manager_profile_id uuid,
  p_status public.hr_employee_status, p_contract_type public.hr_contract_type, p_contract_start date, p_contract_end date)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_id uuid;
begin
  if p_matricule is null or length(btrim(p_matricule)) not between 1 and 64 or p_full_name is null or length(btrim(p_full_name)) not between 1 and 160
    or p_email is null or length(btrim(p_email)) > 254 or position('@' in btrim(p_email)) < 2 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform 1 from public.agencies where id = p_agency_id and is_active for share;
  if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
  perform private.hr_validate_record(p_agency_id, p_job_title, p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
  insert into public.employees(agency_id, employee_id, email, full_name, is_active)
  values(p_agency_id, btrim(p_matricule), lower(btrim(p_email)), btrim(p_full_name), true) returning id into v_id;
  insert into public.employee_hr_records(employee_id, agency_id, job_title, department_id, site_id, team_id, manager_profile_id, status, contract_type, contract_start, contract_end)
  values(v_id, p_agency_id, btrim(p_job_title), p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
  insert into public.employee_private_details(employee_id, agency_id) values(v_id, p_agency_id);
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, p_agency_id, v_id, 'hr_employee.created', 'employee', v_id,
    jsonb_build_object('status', p_status, 'contract_type', p_contract_type, 'site_id', p_site_id, 'department_id', p_department_id));
  return v_id;
end $$;

-- Creates (p_revision null) or updates the HR file of an existing employee.
create function public.hr_save_employee_record(p_actor_id uuid, p_employee_id uuid,
  p_job_title text, p_department_id uuid, p_site_id uuid, p_team_id uuid, p_manager_profile_id uuid,
  p_status public.hr_employee_status, p_contract_type public.hr_contract_type, p_contract_start date, p_contract_end date, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_employee public.employees; v_before public.employee_hr_records; v_changed jsonb;
begin
  select * into v_employee from public.employees where id = p_employee_id for share;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.hr_validate_record(v_employee.agency_id, p_job_title, p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
  select * into v_before from public.employee_hr_records where employee_id = p_employee_id for update;
  if found then
    if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    update public.employee_hr_records set job_title = btrim(p_job_title), department_id = p_department_id, site_id = p_site_id, team_id = p_team_id,
      manager_profile_id = p_manager_profile_id, status = p_status, contract_type = p_contract_type, contract_start = p_contract_start,
      contract_end = p_contract_end, revision = revision + 1, updated_at = now()
    where employee_id = p_employee_id;
  else
    if p_revision is not null then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    insert into public.employee_hr_records(employee_id, agency_id, job_title, department_id, site_id, team_id, manager_profile_id, status, contract_type, contract_start, contract_end)
    values(p_employee_id, v_employee.agency_id, btrim(p_job_title), p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
    insert into public.employee_private_details(employee_id, agency_id) values(p_employee_id, v_employee.agency_id) on conflict (employee_id) do nothing;
  end if;
  -- Field names only: the audit trail records what changed, not its private value.
  select coalesce(jsonb_agg(key), '[]'::jsonb) into v_changed from jsonb_each(jsonb_build_object(
    'job_title', v_before.job_title is distinct from btrim(p_job_title), 'department_id', v_before.department_id is distinct from p_department_id,
    'site_id', v_before.site_id is distinct from p_site_id, 'team_id', v_before.team_id is distinct from p_team_id,
    'manager_profile_id', v_before.manager_profile_id is distinct from p_manager_profile_id, 'status', v_before.status is distinct from p_status,
    'contract_type', v_before.contract_type is distinct from p_contract_type, 'contract_start', v_before.contract_start is distinct from p_contract_start,
    'contract_end', v_before.contract_end is distinct from p_contract_end)) where value = 'true'::jsonb;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_employee.agency_id, p_employee_id, case when v_before.employee_id is null then 'hr_employee_record.created' else 'hr_employee_record.updated' end,
    'employee', p_employee_id, jsonb_build_object('changed', v_changed, 'status', p_status, 'previous_status', v_before.status));
end $$;

create function public.hr_save_private_details(p_actor_id uuid, p_employee_id uuid, p_personal_email text, p_personal_phone text,
  p_postal_address text, p_emergency_contact text, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_before public.employee_private_details; v_changed jsonb;
  v_email text := lower(nullif(btrim(p_personal_email), '')); v_phone text := nullif(btrim(p_personal_phone), '');
  v_address text := nullif(btrim(p_postal_address), ''); v_emergency text := nullif(btrim(p_emergency_contact), '');
begin
  select * into v_before from public.employee_private_details where employee_id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  update public.employee_private_details set personal_email = v_email, personal_phone = v_phone, postal_address = v_address,
    emergency_contact = v_emergency, revision = revision + 1, updated_at = now() where employee_id = p_employee_id;
  select coalesce(jsonb_agg(key), '[]'::jsonb) into v_changed from jsonb_each(jsonb_build_object(
    'personal_email', v_before.personal_email is distinct from v_email, 'personal_phone', v_before.personal_phone is distinct from v_phone,
    'postal_address', v_before.postal_address is distinct from v_address, 'emergency_contact', v_before.emergency_contact is distinct from v_emergency)) where value = 'true'::jsonb;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_before.agency_id, p_employee_id, 'hr_private_details.updated', 'employee', p_employee_id, jsonb_build_object('changed', v_changed));
end $$;

-- Administrative follow-up only: this is not a CNAPS tele-declaration.
create function public.hr_update_cnaps(p_actor_id uuid, p_employee_id uuid, p_cnaps_number text, p_cnaps_status public.hr_cnaps_status, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_before public.employee_private_details; v_number text := nullif(btrim(p_cnaps_number), '');
begin
  if p_cnaps_status is null or (v_number is not null and length(v_number) > 80) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_cnaps_status = 'DECLARED' and v_number is null then raise exception 'cnaps_number_required' using errcode = '22023'; end if;
  select * into v_before from public.employee_private_details where employee_id = p_employee_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  update public.employee_private_details set cnaps_number = v_number, cnaps_status = p_cnaps_status, revision = revision + 1, updated_at = now()
  where employee_id = p_employee_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_before.agency_id, p_employee_id, 'hr_cnaps.updated', 'employee', p_employee_id,
    jsonb_build_object('status', p_cnaps_status, 'previous_status', v_before.cnaps_status, 'number_changed', v_before.cnaps_number is distinct from v_number));
end $$;

revoke all on function public.hr_create_employee(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date) from public, anon, authenticated;
revoke all on function public.hr_save_employee_record(uuid, uuid, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date, integer) from public, anon, authenticated;
revoke all on function public.hr_save_private_details(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.hr_update_cnaps(uuid, uuid, text, public.hr_cnaps_status, integer) from public, anon, authenticated;
grant execute on function public.hr_create_employee(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date) to service_role;
grant execute on function public.hr_save_employee_record(uuid, uuid, text, uuid, uuid, uuid, uuid, public.hr_employee_status, public.hr_contract_type, date, date, integer) to service_role;
grant execute on function public.hr_save_private_details(uuid, uuid, text, text, text, text, integer) to service_role;
grant execute on function public.hr_update_cnaps(uuid, uuid, text, public.hr_cnaps_status, integer) to service_role;
