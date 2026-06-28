-- Security hardening for Codex Security DSS-CAND-001.
-- Import rows and import workflow state are server-owned. Authenticated users may read
-- through RLS, but API routes/RPCs must perform mutations with service_role after app
-- authorization checks pass.

revoke insert on table public.payroll_imports from authenticated;
revoke insert, update on table public.payroll_import_rows from authenticated;

drop policy if exists imports_insert_manager on public.payroll_imports;
drop policy if exists import_rows_insert_manager on public.payroll_import_rows;
drop policy if exists import_rows_update_manager on public.payroll_import_rows;

comment on table public.payroll_imports is
  'Payroll import workflow state is server-owned. Authenticated clients may not insert import records directly.';

comment on table public.payroll_import_rows is
  'Payroll import row payloads are server-owned. Authenticated clients may not insert or update row payloads directly.';

do $$
begin
  create type public.employee_invitation_status as enum (
    'PENDING',
    'ACCEPTED',
    'REVOKED',
    'EXPIRED'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id text not null,
  email text not null,
  full_name text not null,
  token_hash text not null unique,
  status public.employee_invitation_status not null default 'PENDING',
  invited_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, employee_id, status),
  check (email = lower(email)),
  check (position('@' in email) > 1),
  check (btrim(employee_id) <> ''),
  check (btrim(full_name) <> ''),
  check (btrim(token_hash) <> '')
);

alter table public.employee_invitations enable row level security;

grant select on table public.employee_invitations to authenticated;
grant all privileges on table public.employee_invitations to service_role;

drop policy if exists employee_invitations_select_manager_or_recipient on public.employee_invitations;
create policy employee_invitations_select_manager_or_recipient on public.employee_invitations
for select to authenticated
using (
  private.is_global_reader()
  or (
    private.current_app_role() = 'agency_manager'
    and agency_id = private.current_agency_id()
  )
  or (
    private.current_app_role() = 'employee'
    and email = (
      select p.email
      from public.profiles p
      where p.id = private.current_profile_id()
    )
  )
);

create or replace function public.accept_employee_invitation(
  p_auth_user_id uuid,
  p_token_hash text
)
returns table (
  agency_id uuid,
  employee_id text,
  status public.employee_invitation_status
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_accepted_agency_id uuid;
  v_accepted_at timestamptz := now();
  v_accepted_employee_id text;
  v_accepted_status public.employee_invitation_status;
  v_employee_profile_id uuid;
  v_invitation_agency_id uuid;
  v_invitation_email text;
  v_invitation_employee_id text;
  v_invitation_id uuid;
  v_profile_email text;
  v_profile_id uuid;
  v_profile_role public.app_role;
begin
  if p_auth_user_id is null or p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'not_found';
  end if;

  select p.id, p.email, p.role
  into v_profile_id, v_profile_email, v_profile_role
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;

  if not found or v_profile_role <> 'employee'::public.app_role then
    raise exception 'forbidden';
  end if;

  select i.id, i.agency_id, i.employee_id, i.email
  into v_invitation_id, v_invitation_agency_id, v_invitation_employee_id, v_invitation_email
  from public.employee_invitations i
  where i.token_hash = p_token_hash
    and i.status = 'PENDING'::public.employee_invitation_status
    and i.expires_at > v_accepted_at
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if v_profile_email <> v_invitation_email then
    raise exception 'forbidden';
  end if;

  update public.employees e
  set
    profile_id = v_profile_id,
    updated_at = v_accepted_at
  where e.agency_id = v_invitation_agency_id
    and e.employee_id = v_invitation_employee_id
  returning e.profile_id
  into v_employee_profile_id;

  if not found or v_employee_profile_id <> v_profile_id then
    raise exception 'employee_update_failed';
  end if;

  update public.employee_invitations i
  set
    accepted_at = v_accepted_at,
    accepted_by = v_profile_id,
    status = 'ACCEPTED'::public.employee_invitation_status,
    updated_at = v_accepted_at
  where i.id = v_invitation_id
    and i.status = 'PENDING'::public.employee_invitation_status
  returning i.agency_id, i.employee_id, i.status
  into v_accepted_agency_id, v_accepted_employee_id, v_accepted_status;

  if (
    not found
    or v_accepted_agency_id <> v_invitation_agency_id
    or v_accepted_employee_id <> v_invitation_employee_id
    or v_accepted_status <> 'ACCEPTED'::public.employee_invitation_status
  ) then
    raise exception 'invitation_update_failed';
  end if;

  agency_id := v_accepted_agency_id;
  employee_id := v_accepted_employee_id;
  status := v_accepted_status;
  return next;
end;
$$;

revoke all privileges on function public.accept_employee_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_employee_invitation(uuid, text) to service_role;
