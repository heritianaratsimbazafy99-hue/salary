-- Private HR documents (contracts, administrative files, payslips produced before
-- the platform). Files live in a private Storage bucket without any client policy:
-- only the server (service role) creates signed upload/download URLs after its
-- own authorization checks. Published payslips are NOT copied here; they remain
-- payslips/payslip_versions rendered on demand.
-- Uploads go browser -> Storage (Vercel functions cap bodies at 4.5 MB). A row
-- stays PENDING, invisible to the employee, until the server has verified the
-- stored bytes. No automatic purge: retention of these documents is undecided.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-documents', 'hr-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create type public.hr_document_category as enum ('CONTRACT', 'ADMINISTRATIVE', 'HISTORICAL_PAYSLIP');
create type public.hr_document_status as enum ('PENDING', 'AVAILABLE', 'REJECTED', 'WITHDRAWN');

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  employee_id uuid not null,
  category public.hr_document_category not null,
  title text not null,
  document_date date not null,
  period text,
  mime_type text not null,
  size_bytes integer not null,
  storage_path text not null unique,
  status public.hr_document_status not null default 'PENDING',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  available_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id),
  constraint employee_documents_employee_agency_fk foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  constraint employee_documents_mime check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  constraint employee_documents_size check (size_bytes between 1 and 10485760),
  constraint employee_documents_period check (
    (category = 'HISTORICAL_PAYSLIP' and period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') or (category <> 'HISTORICAL_PAYSLIP' and period is null)
  ),
  constraint employee_documents_path check (storage_path = agency_id::text || '/' || employee_id::text || '/' || id::text),
  check (length(btrim(title)) between 1 and 200),
  check ((status <> 'AVAILABLE' or (available_at is not null and withdrawn_at is null)) and (status <> 'WITHDRAWN' or withdrawn_at is not null))
);
create index employee_documents_employee_idx on public.employee_documents(employee_id, agency_id, status);
create index employee_documents_uploaded_by_idx on public.employee_documents(uploaded_by);
create index employee_documents_withdrawn_by_idx on public.employee_documents(withdrawn_by);

alter table public.employee_documents enable row level security;
-- Column grants: the storage path never reaches a browser session.
grant select (id, agency_id, employee_id, category, title, document_date, period, mime_type, size_bytes, status, created_at, available_at, withdrawn_at)
  on table public.employee_documents to authenticated;
grant all privileges on table public.employee_documents to service_role;

-- HR sees every state for its files; the employee only sees available documents
-- of an active employment. Managers, clients and payroll managers see nothing.
create policy employee_documents_select_hr_or_owner on public.employee_documents for select to authenticated
using ((select private.is_global_reader())
  or (status = 'AVAILABLE' and (select private.current_app_role()) = 'employee' and private.employee_access_active(employee_id)));

create function public.hr_begin_document_upload(p_actor_id uuid, p_employee_id uuid, p_category public.hr_document_category, p_title text,
  p_document_date date, p_period text, p_mime_type text, p_size_bytes integer)
returns table(document_id uuid, storage_path text) language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_employee public.employees; v_id uuid := gen_random_uuid();
begin
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_document_date is null or p_category is null
    or p_mime_type not in ('application/pdf', 'image/png', 'image/jpeg') or p_size_bytes is null or p_size_bytes not between 1 and 10485760
    or (p_category = 'HISTORICAL_PAYSLIP' and (p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
    or (p_category <> 'HISTORICAL_PAYSLIP' and p_period is not null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_employee from public.employees where id = p_employee_id for share;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.employee_documents(id, agency_id, employee_id, category, title, document_date, period, mime_type, size_bytes, storage_path, uploaded_by)
  values(v_id, v_employee.agency_id, v_employee.id, p_category, btrim(p_title), p_document_date, p_period, p_mime_type, p_size_bytes,
    v_employee.agency_id::text || '/' || v_employee.id::text || '/' || v_id::text, v_actor.id);
  return query select v_id, v_employee.agency_id::text || '/' || v_employee.id::text || '/' || v_id::text;
end $$;

-- Called after the server has read the stored object and checked its signature.
create function public.hr_complete_document_upload(p_actor_id uuid, p_document_id uuid, p_verified_mime text, p_verified_size integer)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_document public.employee_documents;
begin
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_document.status <> 'PENDING' then raise exception 'not_pending' using errcode = 'PT409'; end if;
  if p_verified_mime is distinct from v_document.mime_type or p_verified_size is distinct from v_document.size_bytes then
    raise exception 'invalid_file' using errcode = '22023';
  end if;
  update public.employee_documents set status = 'AVAILABLE', available_at = now() where id = p_document_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_document.agency_id, v_document.employee_id, 'hr_document.uploaded', 'employee_document', p_document_id,
    jsonb_build_object('category', v_document.category, 'mime_type', v_document.mime_type, 'size_bytes', v_document.size_bytes, 'period', v_document.period));
end $$;

create function public.hr_reject_document_upload(p_actor_id uuid, p_document_id uuid)
returns text language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_document public.employee_documents;
begin
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_document.status <> 'PENDING' then raise exception 'not_pending' using errcode = 'PT409'; end if;
  update public.employee_documents set status = 'REJECTED' where id = p_document_id;
  return v_document.storage_path;
end $$;

-- Withdrawal hides a document (e.g. filed on the wrong person) without erasing it.
create function public.hr_withdraw_document(p_actor_id uuid, p_document_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_document public.employee_documents;
begin
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_document.status <> 'AVAILABLE' then raise exception 'not_available' using errcode = 'PT409'; end if;
  update public.employee_documents set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = v_actor.id where id = p_document_id;
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, v_document.agency_id, v_document.employee_id, 'hr_document.withdrawn', 'employee_document', p_document_id,
    jsonb_build_object('category', v_document.category, 'reason', btrim(p_reason)));
end $$;

revoke all on function public.hr_begin_document_upload(uuid, uuid, public.hr_document_category, text, date, text, text, integer) from public, anon, authenticated;
revoke all on function public.hr_complete_document_upload(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.hr_reject_document_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_withdraw_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hr_begin_document_upload(uuid, uuid, public.hr_document_category, text, date, text, text, integer) to service_role;
grant execute on function public.hr_complete_document_upload(uuid, uuid, text, integer) to service_role;
grant execute on function public.hr_reject_document_upload(uuid, uuid) to service_role;
grant execute on function public.hr_withdraw_document(uuid, uuid, text) to service_role;
