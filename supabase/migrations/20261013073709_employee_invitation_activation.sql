-- Only the verified owner of the invited mailbox may create an employee profile.
-- Keep acceptance and binding atomic; publication never grants payslip access.
alter table public.employee_invitations add column activation_requested_at timestamptz;

create or replace function public.accept_employee_invitation(
  p_auth_user_id uuid,
  p_token_hash text
)
returns table (agency_id uuid, employee_id text, status public.employee_invitation_status)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_email text;
  v_invitation public.employee_invitations%rowtype;
  v_employee public.employees%rowtype;
  v_profile public.profiles%rowtype;
begin
  if p_auth_user_id is null or p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'not_found';
  end if;

  -- Lock the auth identity too: concurrent invitations for one person must not
  -- create conflicting profiles. User-editable metadata never grants a role.
  select lower(u.email) into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  for update;
  if not found then
    raise exception 'forbidden';
  end if;

  select i.* into v_invitation
  from public.employee_invitations i
  where i.token_hash = p_token_hash and i.status = 'PENDING' and i.expires_at > now()
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_auth_email <> v_invitation.email then
    raise exception 'forbidden';
  end if;

  select e.* into v_employee
  from public.employees e
  where e.agency_id = v_invitation.agency_id and e.employee_id = v_invitation.employee_id
  for update;
  if not found or not v_employee.is_active or v_employee.email <> v_auth_email then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.agencies a where a.id = v_invitation.agency_id and a.is_active) then
    raise exception 'forbidden';
  end if;

  select p.* into v_profile
  from public.profiles p where p.auth_user_id = p_auth_user_id
  for update;
  if not found then
    -- Never adopt a profile belonging to another identity, even with the same email.
    if exists (select 1 from public.profiles p where p.email = v_auth_email) then
      raise exception 'forbidden';
    end if;
    insert into public.profiles (auth_user_id, email, full_name, role)
    values (p_auth_user_id, v_auth_email, v_invitation.full_name, 'employee')
    returning * into v_profile;
  end if;
  if v_profile.role <> 'employee' or v_profile.email <> v_auth_email then
    raise exception 'forbidden';
  end if;
  if v_employee.profile_id is not null and v_employee.profile_id <> v_profile.id then
    raise exception 'forbidden';
  end if;

  update public.employees e set profile_id = v_profile.id, updated_at = now()
  where e.id = v_employee.id;
  update public.employee_invitations i
  set accepted_at = now(), accepted_by = v_profile.id, status = 'ACCEPTED', updated_at = now()
  where i.id = v_invitation.id;

  return query select v_invitation.agency_id, v_invitation.employee_id,
    'ACCEPTED'::public.employee_invitation_status;
end;
$$;

revoke all privileges on function public.accept_employee_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_employee_invitation(uuid, text) to service_role;
