-- Access is evaluated from live database state, never stale JWT role claims.
alter table public.profiles add column is_active boolean not null default true;

create or replace function private.current_profile_id()
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select p.id from public.profiles p
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
$$;
create or replace function private.current_app_role()
returns public.app_role language sql stable security definer set search_path = pg_catalog as $$
  select p.role from public.profiles p where p.id = private.current_profile_id()
$$;
create or replace function private.current_agency_id()
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select m.agency_id from public.agency_memberships m join public.agencies a on a.id = m.agency_id
  where m.profile_id = private.current_profile_id() and a.is_active
$$;

drop policy profiles_select_self_or_global on public.profiles;
create policy profiles_select_self_or_global on public.profiles for select to authenticated
using (id = private.current_profile_id() or private.is_global_reader());
-- A user with another active employment must still not see the departed agency.
-- Agencies are deliberately not visible to employees under their normal RLS.
-- Use a narrowly scoped helper for an employment's live access state.
create function private.employee_access_active(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from public.employees e join public.agencies a on a.id = e.agency_id
    where e.id = p_employee_id and e.profile_id = private.current_profile_id() and e.is_active and a.is_active)
$$;
revoke all on function private.employee_access_active(uuid) from public;
grant execute on function private.employee_access_active(uuid) to authenticated, service_role;
create policy employees_active_self on public.employees as restrictive for select to authenticated
using (private.current_app_role() <> 'employee' or private.employee_access_active(id));
create policy payslips_active_employee on public.payslips as restrictive for select to authenticated
using (private.current_app_role() <> 'employee' or private.employee_access_active(employee_id));

-- Close direct membership/agency writes: all changes and their audit are one transaction.
revoke insert, update, delete on public.agency_memberships from authenticated;
revoke insert, update, delete on public.agencies from authenticated;

create function public.admin_save_agency(p_actor_id uuid, p_agency_id uuid, p_name text, p_code text, p_active boolean)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_before public.agencies; v_id uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central', 'super_admin') then raise exception 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_code is null or length(btrim(p_code)) not between 1 and 32 or p_active is null then raise exception 'invalid_input'; end if;
  if p_agency_id is null then
    insert into public.agencies(name,code,is_active) values(btrim(p_name),upper(btrim(p_code)),p_active) returning id into v_id;
  else
    select * into v_before from public.agencies where id=p_agency_id for update;
    if not found then raise exception 'not_found'; end if;
    update public.agencies set name=btrim(p_name), code=upper(btrim(p_code)), is_active=p_active, updated_at=now() where id=p_agency_id;
    v_id := p_agency_id;
  end if;
  insert into public.audit_logs(actor_profile_id,actor_role,agency_id,action,resource_type,resource_id,metadata)
  values(v_actor.id,v_actor.role,v_id,case when p_agency_id is null then 'agency.created' else 'agency.updated' end,'agency',v_id,
    jsonb_build_object('previous_active',v_before.is_active,'active',p_active,'previous_code',v_before.code,'code',upper(btrim(p_code))));
  return v_id;
end $$;

create function public.admin_save_manager(p_actor_id uuid, p_profile_id uuid, p_auth_user_id uuid, p_email text, p_name text, p_agency_id uuid, p_active boolean)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_target public.profiles; v_previous_agency uuid; v_id uuid;
begin
  select * into v_actor from public.profiles where id=p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central','super_admin') then raise exception 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_active is null then raise exception 'invalid_input'; end if;
  perform 1 from public.agencies where id=p_agency_id and (is_active or not p_active) for share;
  if not found then raise exception 'inactive_agency'; end if;
  if p_profile_id is null then
    if p_auth_user_id is null or p_email is null then raise exception 'invalid_input'; end if;
    insert into public.profiles(auth_user_id,email,full_name,role,is_active)
    values(p_auth_user_id,lower(btrim(p_email)),btrim(p_name),'agency_manager',p_active) returning id into v_id;
    insert into public.agency_memberships(profile_id,agency_id) values(v_id,p_agency_id);
  else
    select * into v_target from public.profiles where id=p_profile_id for update;
    if not found or v_target.role <> 'agency_manager' or v_target.id = v_actor.id then raise exception 'forbidden'; end if;
    select agency_id into v_previous_agency from public.agency_memberships where profile_id=p_profile_id for update;
    update public.profiles set full_name=btrim(p_name),is_active=p_active,updated_at=now() where id=p_profile_id;
    insert into public.agency_memberships(profile_id,agency_id) values(p_profile_id,p_agency_id)
      on conflict(profile_id) do update set agency_id=excluded.agency_id;
    v_id := p_profile_id;
  end if;
  insert into public.audit_logs(actor_profile_id,actor_role,agency_id,action,resource_type,resource_id,metadata)
  values(v_actor.id,v_actor.role,p_agency_id,case when p_profile_id is null then 'manager.created' else 'manager.updated' end,'profile',v_id,
    jsonb_build_object('previous_agency_id',v_previous_agency,'previous_active',v_target.is_active,'active',p_active));
  return v_id;
end $$;

create function public.admin_set_employee_access(p_actor_id uuid, p_employee_id uuid, p_active boolean)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_employee public.employees;
begin
  select * into v_actor from public.profiles where id=p_actor_id and is_active for share;
  if not found or v_actor.role not in ('hr_central','super_admin') then raise exception 'forbidden'; end if;
  if p_active is null then raise exception 'invalid_input'; end if;
  select * into v_employee from public.employees where id=p_employee_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_active then
    perform 1 from public.agencies where id=v_employee.agency_id and is_active for share;
    if not found then raise exception 'inactive_agency'; end if;
  end if;
  update public.employees set is_active=p_active,updated_at=now() where id=p_employee_id;
  insert into public.audit_logs(actor_profile_id,actor_role,agency_id,employee_id,action,resource_type,resource_id,metadata)
  values(v_actor.id,v_actor.role,v_employee.agency_id,p_employee_id,'employee.access_updated','employee',p_employee_id,
    jsonb_build_object('previous_active',v_employee.is_active,'active',p_active,'scope','agency_employment'));
end $$;
revoke all on function public.admin_save_agency(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.admin_save_manager(uuid,uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.admin_set_employee_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_save_agency(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.admin_save_manager(uuid,uuid,uuid,text,text,uuid,boolean) to service_role;
grant execute on function public.admin_set_employee_access(uuid,uuid,boolean) to service_role;
