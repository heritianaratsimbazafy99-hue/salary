-- HR requests: an employee (or HR on their behalf) opens a request, HR replies and
-- follows it to resolution. One current reply is kept (not a full message thread).
-- Only HR and the employee concerned can read them: no manager or client access.

create type public.hr_request_category as enum ('CONTRACT', 'PAYROLL', 'LEAVE', 'ADMINISTRATIVE', 'OTHER');
create type public.hr_request_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED');

create table public.hr_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  employee_id uuid not null,
  category public.hr_request_category not null,
  subject text not null,
  message text not null,
  status public.hr_request_status not null default 'OPEN',
  reply text,
  replied_by uuid references public.profiles(id),
  replied_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint hr_requests_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint hr_requests_subject check (length(btrim(subject)) between 1 and 200),
  constraint hr_requests_message check (length(btrim(message)) between 1 and 4000),
  constraint hr_requests_reply check (reply is null or length(btrim(reply)) between 1 and 4000),
  constraint hr_requests_answered check (status = 'OPEN' or (reply is not null and replied_at is not null)),
  check (revision > 0)
);
create index hr_requests_agency_status_idx on public.hr_requests(agency_id, status, created_at desc);
create index hr_requests_employee_idx on public.hr_requests(employee_id, created_at desc);
create index hr_requests_created_by_idx on public.hr_requests(created_by);
create index hr_requests_replied_by_idx on public.hr_requests(replied_by);

alter table public.hr_requests enable row level security;
grant select on table public.hr_requests to authenticated;
grant all privileges on table public.hr_requests to service_role;
create policy hr_requests_select_hr_or_self on public.hr_requests for select to authenticated
using ((select private.is_global_reader())
  or ((select private.current_app_role()) = 'employee' and private.employee_access_active(employee_id)));

create function public.hr_create_request(p_actor_id uuid, p_employee_id uuid, p_category public.hr_request_category, p_subject text, p_message text)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles; v_employee public.employees; v_id uuid;
begin
  select * into v_actor from public.profiles where id = p_actor_id and is_active for share;
  select * into v_employee from public.employees where id = p_employee_id for share;
  if v_actor.id is null or v_employee.id is null or not (v_actor.role in ('hr_central', 'super_admin')
    or (v_actor.role = 'employee' and v_employee.profile_id = v_actor.id and v_employee.is_active
      and exists(select 1 from public.agencies a where a.id = v_employee.agency_id and a.is_active))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_category is null or p_subject is null or length(btrim(p_subject)) not between 1 and 200 or p_message is null or length(btrim(p_message)) not between 1 and 4000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.hr_requests(agency_id, employee_id, category, subject, message, created_by)
  values(v_employee.agency_id, p_employee_id, p_category, btrim(p_subject), btrim(p_message), v_actor.id) returning id into v_id;
  -- The audit records the category only; subject and message may be personal.
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_employee.agency_id, p_employee_id, 'hr_request.created', 'hr_request', v_id, jsonb_build_object('category', p_category));
  return v_id;
end $$;

create function public.hr_reply_request(p_actor_id uuid, p_request_id uuid, p_reply text, p_status public.hr_request_status, p_revision integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_request public.hr_requests;
begin
  if p_status is null or p_status = 'OPEN' or p_reply is null or length(btrim(p_reply)) not between 1 and 4000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_request from public.hr_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_request.revision is distinct from p_revision then raise exception 'stale_revision' using errcode = 'PT409'; end if;
  update public.hr_requests set reply = btrim(p_reply), status = p_status, replied_by = v_actor.id, replied_at = now(), updated_at = now(), revision = revision + 1
  where id = p_request_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_request.agency_id, v_request.employee_id, 'hr_request.replied', 'hr_request', p_request_id,
    jsonb_build_object('status', p_status, 'previous_status', v_request.status));
end $$;

revoke all on function public.hr_create_request(uuid, uuid, public.hr_request_category, text, text) from public, anon, authenticated;
revoke all on function public.hr_reply_request(uuid, uuid, text, public.hr_request_status, integer) from public, anon, authenticated;
grant execute on function public.hr_create_request(uuid, uuid, public.hr_request_category, text, text) to service_role;
grant execute on function public.hr_reply_request(uuid, uuid, text, public.hr_request_status, integer) to service_role;
