
create table public.payroll_departure_approvals (
 import_id uuid primary key references public.payroll_imports(id) on delete cascade,
 fingerprint text not null, approved_by uuid not null references public.profiles(id), approved_at timestamptz not null default now()
);
alter table public.payroll_departure_approvals enable row level security;
revoke all on public.payroll_departure_approvals from anon, authenticated;
grant all on public.payroll_departure_approvals to service_role;

-- Include current identity and employment versions. Historical row snapshots stay intact.
create or replace function public.review_payroll_import(p_import_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare a uuid;
begin
 select agency_id into a from public.payroll_imports where id=p_import_id and created_at+interval '1 year'>now();
 if a is null then return null; end if;
 if coalesce(current_setting('role',true),'')<>'service_role' and coalesce(auth.jwt()->>'role','')<>'service_role' and not (session_user='postgres' and coalesce(current_setting('role',true),'none') in ('none','postgres')) and not private.agency_can_read(a) then raise exception 'forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.payroll_import_rows r join public.employees e on e.agency_id=r.agency_id where r.import_id=p_import_id and ((e.employee_id=r.employee_id and lower(e.email)<>lower(r.employee_email)) or (e.employee_id<>r.employee_id and lower(e.email)=lower(r.employee_email)))) then raise exception 'Conflit d’identité. Vérifiez le dossier salarié.' using errcode='PT422'; end if;
 return (select jsonb_build_object(
 'fingerprint', md5(to_jsonb(pi)::text || coalesce((select jsonb_agg(to_jsonb(r) order by r.id)::text from public.payroll_import_rows r where r.import_id=pi.id),'[]') || coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'revision',e.revision,'lifecycleRevision',l.revision,'state',l.state) order by e.id)::text from public.payroll_import_rows r join public.employees e on e.agency_id=r.agency_id and e.employee_id=r.employee_id left join public.employee_employment_lifecycle l on l.employee_id=e.id where r.import_id=pi.id),'[]')),
 'recipients', coalesce((select jsonb_agg(jsonb_build_object('employeeId',r.employee_id,'employeeName',r.employee_name,'email',r.employee_email,'departed',coalesce(l.state='DEPARTED',false),'nameDiffers',e.full_name is not null and e.full_name<>r.employee_name) order by r.employee_name,r.id) from public.payroll_import_rows r left join public.employees e on e.agency_id=r.agency_id and e.employee_id=r.employee_id left join public.employee_employment_lifecycle l on l.employee_id=e.id where r.import_id=pi.id),'[]'::jsonb)) from public.payroll_imports pi where pi.id=p_import_id);
end;
$$;

create function public.approve_departed_payroll(p_actor_id uuid,p_import_id uuid,p_fingerprint text)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; actual text;
begin
 select agency_id into a from public.payroll_imports where id=p_import_id and status='READY_FOR_PREVIEW' and created_at+interval '1 year'>now() for update;
 if a is null then raise exception 'not_found' using errcode='P0002'; end if;
 perform private.agency_require_actor(p_actor_id,a);
 if not exists(select 1 from public.profiles where id=p_actor_id and role in ('hr_central','super_admin') and is_active) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.employees e join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id order by e.id for update of e;
 perform 1 from public.employee_employment_lifecycle l join public.employees e on e.id=l.employee_id join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id order by e.id for update of l;
 actual:=public.review_payroll_import(p_import_id)->>'fingerprint';
 if actual is null or actual is distinct from p_fingerprint then raise exception 'stale_review' using errcode='PT409'; end if;
 insert into public.payroll_departure_approvals(import_id,fingerprint,approved_by) values(p_import_id,actual,p_actor_id) on conflict(import_id) do update set fingerprint=excluded.fingerprint,approved_by=excluded.approved_by,approved_at=now();
 perform private.agency_employee_event(p_actor_id,e.id,'payroll.departure_approved') from public.employees e join public.employee_employment_lifecycle l on l.employee_id=e.id join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id and l.state='DEPARTED';
end; $$;
revoke all on function public.approve_departed_payroll(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_departed_payroll(uuid,uuid,text) to service_role;

create or replace function public.publish_payroll_import(
  p_import_id uuid,
  p_actor_profile_id uuid,
  p_actor_agency_id uuid
)
returns table (
  import_id uuid,
  agency_id uuid,
  period_start date,
  period_end date,
  published_count integer,
  status public.import_status
)
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_actor_role public.app_role;
  v_employee record;
  v_import record;
  v_payslip record;
  v_published_count integer := 0;
  v_row record;
  v_version_id uuid;
  v_version_number integer;
begin
  select p.role
    into v_actor_role
  from public.profiles p
  where p.id = p_actor_profile_id and p.is_active
  for share;

  if v_actor_role is distinct from 'agency_manager'::public.app_role then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  perform 1 from public.agency_memberships am join public.agencies a on a.id = am.agency_id
  where am.profile_id = p_actor_profile_id and am.agency_id = p_actor_agency_id and a.is_active
  for share of am, a;
  if not found then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  select pi.id, pi.agency_id, pi.period_start, pi.period_end, pi.status, pi.created_at
    into v_import
  from public.payroll_imports pi
  where pi.id = p_import_id
  for update;

  if not found then
    raise exception 'Import introuvable.' using errcode = 'P0002';
  end if;

  if v_import.agency_id <> p_actor_agency_id then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  if v_import.created_at + interval '1 year' <= now() then
    raise exception 'Import expiré.' using errcode = '42501';
  end if;

  if v_import.status <> 'READY_FOR_PREVIEW'::public.import_status then
    raise exception 'Import is not ready for publication.' using errcode = 'P0001';
  end if;

  perform 1 from public.employees e join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id order by e.id for update of e;
  perform 1 from public.employee_employment_lifecycle l join public.employees e on e.id=l.employee_id join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id order by e.id for update of l;
  if exists (select 1 from public.employees e join public.employee_employment_lifecycle l on l.employee_id=e.id join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id and l.state='DEPARTED') and not exists (select 1 from public.payroll_departure_approvals a where a.import_id=p_import_id and a.fingerprint=public.review_payroll_import(p_import_id)->>'fingerprint') then
    raise exception 'Validation RH nécessaire pour les salariés partis et cette version de paie.' using errcode='PT409';
  end if;

  for v_row in
    select pir.employee_email,
           pir.employee_id,
           pir.employee_name,
           pir.normalized_data,
           pir.pay_items
    from public.payroll_import_rows pir
    where pir.import_id = p_import_id
      and pir.agency_id = v_import.agency_id
    order by pir.employee_id
    for update
  loop
    perform 1 from public.employees e where e.agency_id = v_import.agency_id and e.employee_id = v_row.employee_id for update;
    if exists (select 1 from public.employees e where e.agency_id = v_import.agency_id and e.employee_id = v_row.employee_id and not e.is_active and not exists (select 1 from public.employee_employment_lifecycle l where l.employee_id=e.id and l.state='DEPARTED')) then
      raise exception 'Un salarié est désactivé. Réactivation RH nécessaire.' using errcode = 'PT409';
    end if;

    if exists (select 1 from public.employees e where e.agency_id = v_import.agency_id and
      ((e.employee_id = v_row.employee_id and lower(e.email) <> lower(v_row.employee_email)) or
       (e.employee_id <> v_row.employee_id and lower(e.email) = lower(v_row.employee_email)))) then
      raise exception 'Conflit d’identité pour le matricule %. Vérifiez le dossier RH et l’email avant de réimporter.', v_row.employee_id using errcode = 'PT422';
    end if;

    insert into public.employees (
      agency_id,
      email,
      employee_id,
      full_name,
      is_active
    )
    values (
      v_import.agency_id,
      lower(v_row.employee_email),
      v_row.employee_id,
      v_row.employee_name,
      true
    )
    on conflict on constraint employees_agency_id_employee_id_key do update
      set employee_id = excluded.employee_id
    returning id, profile_id, email, is_active
      into v_employee;

    -- A previously absent employee can be inserted concurrently while the
    -- preflight SELECT sees no row. ON CONFLICT locks the winning row; validate
    -- that returned state too so a concurrent disabled employee cannot publish.
    if lower(v_employee.email) <> lower(v_row.employee_email) then
      raise exception 'L’identité du salarié a changé. Vérifiez le dossier RH.' using errcode = 'PT422';
    end if;
    if not v_employee.is_active and not exists (select 1 from public.employee_employment_lifecycle l where l.employee_id=v_employee.id and l.state='DEPARTED') then
      raise exception 'Un salarié est désactivé. Réactivation RH nécessaire.' using errcode = 'PT409';
    end if;

    select p.id, p.current_version_id
      into v_payslip
    from public.payslips p
    where p.agency_id = v_import.agency_id
      and p.employee_id = v_employee.id
      and p.period_start = v_import.period_start
      and p.period_end = v_import.period_end
    for update;

    if not found then
      insert into public.payslips (
        agency_id,
        employee_id,
        period_end,
        period_start,
        published_by
      )
      values (
        v_import.agency_id,
        v_employee.id,
        v_import.period_end,
        v_import.period_start,
        p_actor_profile_id
      )
      returning id, current_version_id
        into v_payslip;
    end if;

    if v_payslip.current_version_id is not null then
      update public.payslip_versions
      set replaced_at = now()
      where id = v_payslip.current_version_id
        and payslip_id = v_payslip.id
        and replaced_at is null;
    end if;

    select coalesce(max(pv.version_number), 0) + 1
      into v_version_number
    from public.payslip_versions pv
    where pv.payslip_id = v_payslip.id;

    insert into public.payslip_versions (
      agency_id,
      import_id,
      pay_items,
      payslip_id,
      published_by,
      snapshot_data,
      version_number
    )
    values (
      v_import.agency_id,
      p_import_id,
      coalesce(v_row.pay_items, '[]'::jsonb),
      v_payslip.id,
      p_actor_profile_id,
      v_row.normalized_data,
      v_version_number
    )
    returning id
      into v_version_id;

    update public.payslips
    set current_version_id = v_version_id,
        published_at = now(),
        published_by = p_actor_profile_id
    where public.payslips.id = v_payslip.id
      and public.payslips.agency_id = v_import.agency_id;

    insert into public.notifications (
      notification_type,
      recipient_email,
      recipient_profile_id,
      resource_id,
      resource_type,
      status
    )
    values (
      'PAYSLIP_PUBLISHED',
      lower(v_employee.email),
      v_employee.profile_id,
      v_payslip.id,
      'payslip',
      'PENDING'
    );

    v_published_count := v_published_count + 1;
  end loop;

  update public.payroll_imports
  set status = 'PUBLISHED'::public.import_status
  where public.payroll_imports.id = p_import_id
    and public.payroll_imports.agency_id = v_import.agency_id
    and public.payroll_imports.status = 'READY_FOR_PREVIEW'::public.import_status;

  return query
  select v_import.id,
         v_import.agency_id,
         v_import.period_start,
         v_import.period_end,
         v_published_count,
         'PUBLISHED'::public.import_status;
exception when unique_violation then
  -- A competing publication may claim the same email after the preflight read.
  raise exception 'Conflit de matricule ou d’email. Vérifiez les dossiers RH avant de réimporter.' using errcode = 'PT422';
end;
$$;

revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from public;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from anon;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from authenticated;
grant execute on function public.publish_payroll_import(uuid, uuid, uuid) to service_role;


create or replace function public.publish_payroll_import_reviewed(p_import_id uuid, p_actor_profile_id uuid, p_actor_agency_id uuid, p_fingerprint text)
returns table (import_id uuid, agency_id uuid, period_start date, period_end date, published_count integer, status public.import_status)
language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
begin
  perform 1 from public.profiles p join public.agency_memberships m on m.profile_id = p.id
    where p.id = p_actor_profile_id and p.is_active and p.role = 'agency_manager' and m.agency_id = p_actor_agency_id for share of p, m;
  if not found then raise exception 'Action non autorisee.' using errcode = '42501'; end if;
  perform 1 from public.payroll_imports where id = p_import_id for update;
  perform 1 from public.employees e join public.payroll_import_rows r on r.agency_id = e.agency_id and r.employee_id = e.employee_id where r.import_id = p_import_id for update of e;
  perform 1 from public.agencies where id = p_actor_agency_id and is_active for share;
  if not found then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;
  perform 1 from public.employee_employment_lifecycle l join public.employees e on e.id=l.employee_id join public.payroll_import_rows r on r.agency_id=e.agency_id and r.employee_id=e.employee_id where r.import_id=p_import_id order by e.id for update of l;
  if p_fingerprint is null or p_fingerprint is distinct from public.review_payroll_import(p_import_id)->>'fingerprint' then
    raise exception 'La revue est périmée. Rechargez les destinataires.' using errcode = 'PT409';
  end if;
  return query select * from public.publish_payroll_import(p_import_id, p_actor_profile_id, p_actor_agency_id);
end;
$$;
revoke all on function public.publish_payroll_import_reviewed(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_payroll_import_reviewed(uuid, uuid, uuid, text) to service_role;


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
  if exists(select 1 from public.employee_employment_lifecycle l where l.employee_id=v_employee.id and l.state='DEPARTED') then raise exception 'forbidden'; end if;
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
    values (p_auth_user_id, v_auth_email, v_employee.full_name, 'employee')
    returning * into v_profile;
  end if;
  if not v_profile.is_active or v_profile.role <> 'employee' or v_profile.email <> v_auth_email then
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

-- A durable outbox. Tokens are derived in server memory from the job UUID and
-- the service secret; only their digest is stored. Retrying preserves the payload.
create table public.agency_invitation_jobs (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id),
 actor_id uuid not null references public.profiles(id), operation_id uuid not null,
 status text not null default 'PENDING' check(status in ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
 attempts integer not null default 0, first_attempt_at timestamptz, lease_until timestamptz, provider_message_id text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '14 days',
 unique(operation_id,employee_id)
);
alter table public.agency_invitation_jobs enable row level security;
revoke all on public.agency_invitation_jobs from anon,authenticated;
grant all on public.agency_invitation_jobs to service_role;

create function public.queue_agency_invitations(p_actor_id uuid,p_agency_id uuid,p_employee_ids uuid[],p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.employees; ids jsonb:='[]'; j uuid;
begin
 perform private.agency_require_actor(p_actor_id,p_agency_id);
 if p_operation_id is null or cardinality(p_employee_ids) not between 1 and 500 then raise exception 'invalid_input' using errcode='22023'; end if;
 for e in select * from public.employees where id=any(p_employee_ids) order by id for update loop
  if e.agency_id<>p_agency_id then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.agency_employee_change_requests q where q.employee_id=e.id and q.kind='EMAIL' and q.status='APPROVED_PENDING_VERIFICATION') or not e.is_active or e.profile_id is not null or exists(select 1 from public.employee_employment_lifecycle l where l.employee_id=e.id and l.state='DEPARTED') then continue; end if;
  select id into j from public.agency_invitation_jobs where operation_id=p_operation_id and employee_id=e.id;
  if j is null then
   if exists(select 1 from public.agency_invitation_jobs where employee_id=e.id and created_at>now()-interval '60 seconds') then continue; end if;
   insert into public.agency_invitation_jobs(employee_id,actor_id,operation_id) values(e.id,p_actor_id,p_operation_id) returning id into j;
   perform private.agency_employee_event(p_actor_id,e.id,'employee.invitation_requested');
  end if;
  ids:=ids||jsonb_build_array(j);
 end loop;
 if (select count(distinct x) from unnest(p_employee_ids) x)<>(select count(*) from public.employees where id=any(p_employee_ids)) then raise exception 'not_found' using errcode='P0002'; end if;
 return ids;
end; $$;

create function public.claim_agency_invitation(p_job_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.agency_invitation_jobs; e public.employees;
begin
 select * into j from public.agency_invitation_jobs where id=p_job_id;
 if not found then return null; end if;
 select * into e from public.employees where id=j.employee_id;
 perform private.agency_require_actor(j.actor_id,e.agency_id);
 select * into e from public.employees where id=j.employee_id for update;
 select * into j from public.agency_invitation_jobs where id=p_job_id for update;
 if j.status in ('SENT','SKIPPED') or j.expires_at<=now() or j.attempts>=10 or (j.attempts>0 and j.first_attempt_at<now()-interval '23 hours') or (j.status='SENDING' and j.lease_until>now()) then return null; end if;
 if exists(select 1 from public.agency_employee_change_requests q where q.employee_id=e.id and q.kind='EMAIL' and q.status='APPROVED_PENDING_VERIFICATION') or not e.is_active or e.profile_id is not null or exists(select 1 from public.employee_employment_lifecycle l where l.employee_id=e.id and l.state='DEPARTED') then
  update public.agency_invitation_jobs set status='SKIPPED' where id=j.id; return null;
 end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
 -- No token replacement after another newer explicit invitation.
 if exists(select 1 from public.agency_invitation_jobs n where n.employee_id=e.id and n.created_at>j.created_at) then
  update public.agency_invitation_jobs set status='SKIPPED' where id=j.id; return null;
 end if;
 insert into public.employee_invitations(agency_id,employee_id,email,full_name,invited_by,token_hash,expires_at,status)
 values(e.agency_id,e.employee_id,e.email,e.full_name,j.actor_id,p_token_hash,j.expires_at,'PENDING')
 on conflict(agency_id,employee_id,status) do update set email=excluded.email,full_name=excluded.full_name,invited_by=excluded.invited_by,token_hash=excluded.token_hash,expires_at=excluded.expires_at,updated_at=now();
 update public.agency_invitation_jobs set status='SENDING',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '5 minutes' where id=j.id;
 return jsonb_build_object('email',e.email,'fullName',e.full_name);
end; $$;
revoke all on function public.queue_agency_invitations(uuid,uuid,uuid[],uuid),public.claim_agency_invitation(uuid,text) from public,anon,authenticated;
grant execute on function public.queue_agency_invitations(uuid,uuid,uuid[],uuid),public.claim_agency_invitation(uuid,text) to service_role;

create or replace function public.hr_replacement_candidates(p_replacement_id uuid)
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
  where e.agency_id = v_need.agency_id and e.id <> v_need.absent_employee_id and e.is_active and r.status = 'ACTIVE' and not exists(select 1 from public.employee_employment_lifecycle lc where lc.employee_id=e.id and lc.state='DEPARTED')
    and r.contract_start <= v_need.start_date and (r.contract_end is null or r.contract_end >= v_need.end_date)
    and private.hr_profile_scope_allows(v_profile, e.agency_id, r.department_id, v_need.site_id)
    and not exists(select 1 from public.leave_requests l where l.employee_id = e.id and l.status in ('PENDING', 'APPROVED') and l.start_date <= v_need.end_date and l.end_date >= v_need.start_date)
    and not exists(select 1 from public.hr_replacements o where o.replacement_employee_id = e.id and o.status = 'CONFIRMED' and o.start_date <= v_need.end_date and o.end_date >= v_need.start_date)
  order by e.full_name
  limit 200;
end $fn$;
