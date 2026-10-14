-- HR foundations: client sites, departments, teams and HR access scopes.
-- Every HR record carries agency_id so Airtel and Huawei data stay separated.
-- Writes go through service-role RPCs that re-read the actor, lock rows, check
-- revisions and write the audit entry in the same transaction.

create table public.hr_sites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_sites_id_agency_id_key unique (id, agency_id),
  constraint hr_sites_agency_code_key unique (agency_id, code),
  check (length(btrim(name)) between 1 and 160),
  check (length(btrim(code)) between 1 and 32 and code = upper(code)),
  check (revision > 0)
);

create table public.hr_departments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_departments_id_agency_id_key unique (id, agency_id),
  check (length(btrim(name)) between 1 and 160),
  check (revision > 0)
);
create unique index hr_departments_agency_name_key on public.hr_departments(agency_id, lower(name));

create table public.hr_teams (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  site_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_teams_id_agency_id_key unique (id, agency_id),
  constraint hr_teams_site_agency_fk foreign key (site_id, agency_id) references public.hr_sites(id, agency_id) on delete cascade,
  check (length(btrim(name)) between 1 and 160),
  check (revision > 0)
);
create unique index hr_teams_site_name_key on public.hr_teams(site_id, lower(name));

-- A scope row grants a team_manager a department, a site, or their intersection;
-- a client_viewer always receives one site. One profile is scoped to one agency.
create table public.hr_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  department_id uuid,
  site_id uuid,
  created_at timestamptz not null default now(),
  constraint hr_scopes_department_agency_fk foreign key (department_id, agency_id) references public.hr_departments(id, agency_id) on delete cascade,
  constraint hr_scopes_site_agency_fk foreign key (site_id, agency_id) references public.hr_sites(id, agency_id) on delete cascade,
  constraint hr_scopes_target check (department_id is not null or site_id is not null),
  constraint hr_scopes_profile_target_key unique nulls not distinct (profile_id, department_id, site_id)
);
create index hr_scopes_profile_idx on public.hr_scopes(profile_id);
create index hr_scopes_agency_idx on public.hr_scopes(agency_id);
create index hr_scopes_department_idx on public.hr_scopes(department_id, agency_id);
create index hr_scopes_site_idx on public.hr_scopes(site_id, agency_id);
create index hr_teams_site_idx on public.hr_teams(site_id, agency_id);

alter table public.hr_sites enable row level security;
alter table public.hr_departments enable row level security;
alter table public.hr_teams enable row level security;
alter table public.hr_scopes enable row level security;

-- Scoped HR roles stay live only while they keep a scope in an active agency,
-- like agency managers with their membership. Existing predicates are unchanged.
create or replace function private.current_profile_id()
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
 return (select p.id from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.is_active
    and (p.role <> 'employee' or not exists (
      select 1 from public.employees e where e.profile_id = p.id
    ) or exists (
      select 1 from public.employees e join public.agencies a on a.id = e.agency_id
      where e.profile_id = p.id and e.is_active and a.is_active
    ))
    and (p.role <> 'agency_manager' or exists (
      select 1 from public.agency_memberships m join public.agencies a on a.id = m.agency_id
      where m.profile_id = p.id and a.is_active
    ))
    and (p.role not in ('team_manager', 'client_viewer') or exists (
      select 1 from public.hr_scopes s join public.agencies a on a.id = s.agency_id
      where s.profile_id = p.id and a.is_active
    )));
end $fn$;

-- Live scope decision for a given profile. Used by RLS through hr_scope_allows()
-- and by service-role RPCs, which receive the actor id from the server session.
create function private.hr_profile_scope_allows(p_profile_id uuid, p_agency_id uuid, p_department_id uuid, p_site_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare v_role public.app_role;
begin
 if p_profile_id is null or p_agency_id is null then return false; end if;
 select p.role into v_role from public.profiles p where p.id = p_profile_id and p.is_active;
 if v_role is null then return false; end if;
 if v_role in ('hr_central', 'super_admin') then return true; end if;
 if v_role = 'team_manager' then
  return exists(select 1 from public.hr_scopes s
   join public.agencies a on a.id = s.agency_id and a.is_active
   left join public.hr_departments d on d.id = s.department_id
   left join public.hr_sites st on st.id = s.site_id
   where s.profile_id = p_profile_id and s.agency_id = p_agency_id
     and (s.department_id is null or (s.department_id = p_department_id and d.is_active))
     and (s.site_id is null or (s.site_id = p_site_id and st.is_active)));
 end if;
 if v_role = 'client_viewer' then
  return p_site_id is not null and exists(select 1 from public.hr_scopes s
   join public.agencies a on a.id = s.agency_id and a.is_active
   join public.hr_sites st on st.id = s.site_id and st.is_active
   where s.profile_id = p_profile_id and s.agency_id = p_agency_id and s.site_id = p_site_id);
 end if;
 return false;
end $fn$;

create function private.hr_scope_allows(p_agency_id uuid, p_department_id uuid, p_site_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin return private.hr_profile_scope_allows((select private.current_profile_id()), p_agency_id, p_department_id, p_site_id); end $fn$;

-- Referential names are not personal data, but each role only sees its agency
-- (and a client only its own sites). p_site_id is null for departments.
create function private.hr_referential_visible(p_agency_id uuid, p_site_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare v_profile uuid := (select private.current_profile_id()); v_role public.app_role;
begin
 if v_profile is null then return false; end if;
 select p.role into v_role from public.profiles p where p.id = v_profile;
 if v_role in ('hr_central', 'super_admin') then return true; end if;
 if v_role = 'team_manager' then
  return exists(select 1 from public.hr_scopes s where s.profile_id = v_profile and s.agency_id = p_agency_id);
 end if;
 if v_role = 'client_viewer' then
  return exists(select 1 from public.hr_scopes s where s.profile_id = v_profile and s.agency_id = p_agency_id
    and (p_site_id is null or s.site_id = p_site_id));
 end if;
 if v_role = 'agency_manager' then return p_agency_id = (select private.current_agency_id()); end if;
 if v_role = 'employee' then
  return exists(select 1 from public.employees e where e.profile_id = v_profile and e.agency_id = p_agency_id and e.is_active);
 end if;
 return false;
end $fn$;

revoke all on function private.hr_profile_scope_allows(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.hr_scope_allows(uuid, uuid, uuid) from public, anon;
revoke all on function private.hr_referential_visible(uuid, uuid) from public, anon;
grant execute on function private.hr_profile_scope_allows(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.hr_scope_allows(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.hr_referential_visible(uuid, uuid) to authenticated, service_role;

grant select on table public.hr_sites, public.hr_departments, public.hr_teams, public.hr_scopes to authenticated;
grant all privileges on table public.hr_sites, public.hr_departments, public.hr_teams, public.hr_scopes to service_role;

create policy hr_sites_select_scoped on public.hr_sites for select to authenticated
using ((select private.is_global_reader()) or private.hr_referential_visible(agency_id, id));
create policy hr_departments_select_scoped on public.hr_departments for select to authenticated
using ((select private.is_global_reader()) or private.hr_referential_visible(agency_id, null));
create policy hr_teams_select_scoped on public.hr_teams for select to authenticated
using ((select private.is_global_reader()) or private.hr_referential_visible(agency_id, site_id));
create policy hr_scopes_select_self_or_global on public.hr_scopes for select to authenticated
using (profile_id = (select private.current_profile_id()) or (select private.is_global_reader()));
-- Scoped HR roles need the name of their own agency. Extending the existing
-- policy (rather than adding a second permissive one) keeps a single check.
alter policy agencies_select_scoped on public.agencies using (
  (select private.is_global_reader())
  or ((select private.current_app_role()) = 'agency_manager' and id = (select private.current_agency_id()))
  or exists(select 1 from public.hr_scopes s where s.agency_id = agencies.id and s.profile_id = (select private.current_profile_id())));

create function public.hr_save_site(p_actor_id uuid, p_site_id uuid, p_agency_id uuid, p_name text, p_code text, p_active boolean, p_revision integer)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_before public.hr_sites; v_id uuid; v_agency uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_code is null or length(btrim(p_code)) not between 1 and 32 or p_active is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_site_id is null then
    perform 1 from public.agencies where id = p_agency_id and is_active for share;
    if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
    insert into public.hr_sites(agency_id, name, code, is_active) values(p_agency_id, btrim(p_name), upper(btrim(p_code)), p_active) returning id into v_id;
    v_agency := p_agency_id;
  else
    select * into v_before from public.hr_sites where id = p_site_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    update public.hr_sites set name = btrim(p_name), code = upper(btrim(p_code)), is_active = p_active, revision = revision + 1, updated_at = now() where id = p_site_id;
    v_id := p_site_id; v_agency := v_before.agency_id;
  end if;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_agency, case when p_site_id is null then 'hr_site.created' else 'hr_site.updated' end, 'hr_site', v_id,
    jsonb_build_object('code', upper(btrim(p_code)), 'previous_code', v_before.code, 'active', p_active, 'previous_active', v_before.is_active));
  return v_id;
end $$;

create function public.hr_save_department(p_actor_id uuid, p_department_id uuid, p_agency_id uuid, p_name text, p_active boolean, p_revision integer)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_before public.hr_departments; v_id uuid; v_agency uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_active is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_department_id is null then
    perform 1 from public.agencies where id = p_agency_id and is_active for share;
    if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
    insert into public.hr_departments(agency_id, name, is_active) values(p_agency_id, btrim(p_name), p_active) returning id into v_id;
    v_agency := p_agency_id;
  else
    select * into v_before from public.hr_departments where id = p_department_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    update public.hr_departments set name = btrim(p_name), is_active = p_active, revision = revision + 1, updated_at = now() where id = p_department_id;
    v_id := p_department_id; v_agency := v_before.agency_id;
  end if;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_agency, case when p_department_id is null then 'hr_department.created' else 'hr_department.updated' end, 'hr_department', v_id,
    jsonb_build_object('active', p_active, 'previous_active', v_before.is_active));
  return v_id;
end $$;

create function public.hr_save_team(p_actor_id uuid, p_team_id uuid, p_site_id uuid, p_name text, p_active boolean, p_revision integer)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_before public.hr_teams; v_site public.hr_sites; v_id uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_active is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_team_id is not null then
    select * into v_before from public.hr_teams where id = p_team_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  end if;
  -- A team stays in its agency; it may move to another site of the same agency.
  select * into v_site from public.hr_sites where id = p_site_id and (v_before.agency_id is null or agency_id = v_before.agency_id) for share;
  if not found or (p_active and not v_site.is_active) then raise exception 'inactive_site' using errcode = '22023'; end if;
  if p_team_id is null then
    insert into public.hr_teams(agency_id, site_id, name, is_active) values(v_site.agency_id, v_site.id, btrim(p_name), p_active) returning id into v_id;
  else
    update public.hr_teams set site_id = v_site.id, name = btrim(p_name), is_active = p_active, revision = revision + 1, updated_at = now() where id = p_team_id;
    v_id := p_team_id;
  end if;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_site.agency_id, case when p_team_id is null then 'hr_team.created' else 'hr_team.updated' end, 'hr_team', v_id,
    jsonb_build_object('site_id', v_site.id, 'previous_site_id', v_before.site_id, 'active', p_active, 'previous_active', v_before.is_active));
  return v_id;
end $$;

-- Only super administrators grant HR scopes (RH manages HR data, not accounts).
-- p_scopes: [{"agency_id","department_id"?,"site_id"?}], all in one agency.
-- The target profile row is locked, so a concurrent scope change serializes with
-- every HR RPC that reads the actor profile FOR SHARE. updated_at uses
-- clock_timestamp() so it changes even twice within one transaction.
create function public.admin_save_hr_access(p_actor_id uuid, p_profile_id uuid, p_auth_user_id uuid, p_email text, p_name text,
  p_role public.app_role, p_active boolean, p_scopes jsonb, p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_target public.profiles; v_id uuid; v_agency uuid; v_scope jsonb; v_dept uuid; v_site uuid; v_previous jsonb;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role <> 'super_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('team_manager', 'client_viewer') or p_name is null or length(btrim(p_name)) not between 1 and 160
    or p_active is null or p_scopes is null or jsonb_typeof(p_scopes) <> 'array' or jsonb_array_length(p_scopes) not between 1 and 50 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_scope in select value from jsonb_array_elements(p_scopes) loop
    if jsonb_typeof(v_scope) <> 'object' or nullif(v_scope->>'agency_id', '') is null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if v_agency is null then v_agency := (v_scope->>'agency_id')::uuid;
    elsif v_agency <> (v_scope->>'agency_id')::uuid then raise exception 'invalid_scope' using errcode = '22023'; end if;
    v_dept := nullif(v_scope->>'department_id', '')::uuid;
    v_site := nullif(v_scope->>'site_id', '')::uuid;
    if (v_dept is null and v_site is null) or (p_role = 'client_viewer' and (v_site is null or v_dept is not null)) then
      raise exception 'invalid_scope' using errcode = '22023';
    end if;
    if v_dept is not null then
      perform 1 from public.hr_departments where id = v_dept and agency_id = v_agency and is_active for share;
      if not found then raise exception 'invalid_scope' using errcode = '22023'; end if;
    end if;
    if v_site is not null then
      perform 1 from public.hr_sites where id = v_site and agency_id = v_agency and is_active for share;
      if not found then raise exception 'invalid_scope' using errcode = '22023'; end if;
    end if;
  end loop;
  perform 1 from public.agencies where id = v_agency and (is_active or not p_active) for share;
  if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
  if p_profile_id is null then
    if p_auth_user_id is null or p_email is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    insert into public.profiles(auth_user_id, email, full_name, role, is_active)
    values(p_auth_user_id, lower(btrim(p_email)), btrim(p_name), p_role, p_active) returning id into v_id;
  else
    select * into v_target from public.profiles where id = p_profile_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_target.role not in ('team_manager', 'client_viewer') or v_target.id = v_actor.id then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_expected_updated_at is null or v_target.updated_at <> p_expected_updated_at then raise exception 'stale_revision' using errcode = 'PT409'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('department_id', department_id, 'site_id', site_id) order by department_id, site_id), '[]'::jsonb)
      into v_previous from public.hr_scopes where profile_id = p_profile_id;
    update public.profiles set full_name = btrim(p_name), role = p_role, is_active = p_active, updated_at = clock_timestamp() where id = p_profile_id;
    delete from public.hr_scopes where profile_id = p_profile_id;
    v_id := p_profile_id;
  end if;
  insert into public.hr_scopes(profile_id, agency_id, department_id, site_id)
  select v_id, v_agency, nullif(e->>'department_id', '')::uuid, nullif(e->>'site_id', '')::uuid from jsonb_array_elements(p_scopes) e
  on conflict on constraint hr_scopes_profile_target_key do nothing;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_agency, case when p_profile_id is null then 'hr_access.created' else 'hr_access.updated' end, 'profile', v_id,
    jsonb_build_object('role', p_role, 'previous_role', v_target.role, 'active', p_active, 'previous_active', v_target.is_active,
      'scopes', (select jsonb_agg(jsonb_build_object('department_id', department_id, 'site_id', site_id) order by department_id, site_id) from public.hr_scopes where profile_id = v_id),
      'previous_scopes', v_previous));
  return v_id;
end $$;

create function public.admin_set_hr_access_active(p_actor_id uuid, p_profile_id uuid, p_active boolean, p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_target public.profiles; v_agency uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role <> 'super_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_active is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_target.role not in ('team_manager', 'client_viewer') or v_target.id = v_actor.id then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_updated_at is null or v_target.updated_at <> p_expected_updated_at then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  select agency_id into v_agency from public.hr_scopes where profile_id = p_profile_id limit 1;
  if p_active then
    perform 1 from public.agencies where id = v_agency and is_active for share;
    if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
  end if;
  update public.profiles set is_active = p_active, updated_at = clock_timestamp() where id = p_profile_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_agency, case when p_active then 'hr_access.restored' else 'hr_access.revoked' end, 'profile', p_profile_id,
    jsonb_build_object('role', v_target.role, 'previous_active', v_target.is_active, 'active', p_active));
end $$;

revoke all on function public.hr_save_site(uuid, uuid, uuid, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.hr_save_department(uuid, uuid, uuid, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.hr_save_team(uuid, uuid, uuid, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.admin_save_hr_access(uuid, uuid, uuid, text, text, public.app_role, boolean, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_set_hr_access_active(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.hr_save_site(uuid, uuid, uuid, text, text, boolean, integer) to service_role;
grant execute on function public.hr_save_department(uuid, uuid, uuid, text, boolean, integer) to service_role;
grant execute on function public.hr_save_team(uuid, uuid, uuid, text, boolean, integer) to service_role;
grant execute on function public.admin_save_hr_access(uuid, uuid, uuid, text, text, public.app_role, boolean, jsonb, timestamptz) to service_role;
grant execute on function public.admin_set_hr_access_active(uuid, uuid, boolean, timestamptz) to service_role;
