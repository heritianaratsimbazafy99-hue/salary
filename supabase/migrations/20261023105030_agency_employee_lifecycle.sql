-- Agency employee management. Presence, access and HR contracts are separate.
-- Existing ambiguous records are never inferred as departed, nor assigned dates.
alter table public.employees add column revision integer not null default 1 check (revision > 0);
create function private.employee_identity_revision() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if row(new.agency_id,new.profile_id,new.employee_id,new.email,new.full_name,new.is_active) is distinct from
    row(old.agency_id,old.profile_id,old.employee_id,old.email,old.full_name,old.is_active) then
   new.revision := old.revision + 1;
 else new.revision := old.revision; end if;
 return new;
end $$;
create trigger zz_employees_identity_revision before update on public.employees for each row execute function private.employee_identity_revision();

create table public.employee_employment_lifecycle (
 employee_id uuid primary key, agency_id uuid not null,
 state text not null default 'CURRENT' check(state in ('CURRENT','DEPARTED','TO_REVIEW')),
 started_on date, departed_on date, departure_reason text,
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now(),
 foreign key(employee_id,agency_id) references public.employees(id,agency_id) on delete cascade,
 check ((state='DEPARTED' and departed_on is not null and length(btrim(departure_reason)) between 1 and 300)
   or (state<>'DEPARTED' and departed_on is null and departure_reason is null)),
 check (started_on is null or departed_on is null or departed_on>=started_on)
);
create index employee_lifecycle_agency_state_idx on public.employee_employment_lifecycle(agency_id,state,employee_id);
create table public.employee_agency_operations (
 employee_id uuid primary key,agency_id uuid not null,job_title text,department_id uuid,site_id uuid,team_id uuid,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 foreign key(employee_id,agency_id) references public.employees(id,agency_id) on delete cascade,
 foreign key(department_id,agency_id) references public.hr_departments(id,agency_id),
 foreign key(site_id,agency_id) references public.hr_sites(id,agency_id),
 foreign key(team_id,site_id) references public.hr_teams(id,site_id),
 check(job_title is null or length(btrim(job_title)) between 1 and 160),check(team_id is null or site_id is not null)
);
create table public.employee_employment_episodes (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null,agency_id uuid not null,
 state text not null check(state in ('CURRENT','DEPARTED','TO_REVIEW')),effective_on date,
 lifecycle_revision integer not null,actor_profile_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),unique(employee_id,lifecycle_revision),
 foreign key(employee_id,agency_id) references public.employees(id,agency_id) on delete cascade
);
create table public.agency_employee_change_requests (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null,agency_id uuid not null,
 kind text not null check(kind in ('RETURN','MATRICULE','EMAIL','MANAGER')),
 requested_value text not null check(length(requested_value)<=300),previous_value text,hr_revision integer,reason text not null check(length(btrim(reason)) between 1 and 300),
 status text not null default 'PENDING' check(status in ('PENDING','REJECTED','EXECUTED','APPROVED_PENDING_VERIFICATION')),
 revision integer not null default 1 check(revision>0),employee_revision integer not null,lifecycle_revision integer not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),decided_at timestamptz,decision_reason text,
 foreign key(employee_id,agency_id) references public.employees(id,agency_id) on delete cascade,
 check(decision_reason is null or length(btrim(decision_reason)) between 1 and 300),
 check((status='PENDING' and decided_by is null and decided_at is null) or (status<>'PENDING' and decided_by is not null and decided_at is not null))
);
create unique index agency_employee_request_pending_idx on public.agency_employee_change_requests(employee_id,kind) where status in ('PENDING','APPROVED_PENDING_VERIFICATION');
create index agency_employee_requests_agency_idx on public.agency_employee_change_requests(agency_id,created_at desc);
create table public.agency_employee_events (
 id uuid primary key default gen_random_uuid(),employee_id uuid,agency_id uuid not null,
 actor_profile_id uuid references public.profiles(id) on delete set null,actor_role public.app_role,
 action text not null check(length(action) between 1 and 100),result text not null default 'SUCCESS' check(length(result) between 1 and 50),
 employee_revision integer,lifecycle_revision integer,before_employee_revision integer,before_lifecycle_revision integer,operational_revision integer,before_operational_revision integer,changed_fields text[] not null default '{}',reason text,created_at timestamptz not null default now(),
 expires_at timestamptz not null default ((now() at time zone 'UTC' + interval '12 months') at time zone 'UTC'),
 foreign key(employee_id,agency_id) references public.employees(id,agency_id) on delete set null (employee_id)
);
create index agency_employee_events_expiry_idx on public.agency_employee_events(expires_at);
create index agency_employee_events_employee_idx on public.agency_employee_events(employee_id,created_at desc);

insert into public.employee_employment_lifecycle(employee_id,agency_id,state)
select e.id,e.agency_id,case when not e.is_active or r.status in ('INACTIVE','CONTRACT_ENDED') then 'TO_REVIEW' else 'CURRENT' end
from public.employees e left join public.employee_hr_records r on r.employee_id=e.id;
insert into public.employee_agency_operations(employee_id,agency_id,job_title,department_id,site_id,team_id)
select e.id,e.agency_id,r.job_title,r.department_id,r.site_id,r.team_id from public.employees e left join public.employee_hr_records r on r.employee_id=e.id;
insert into public.employee_employment_episodes(employee_id,agency_id,state,lifecycle_revision)
select employee_id,agency_id,state,revision from public.employee_employment_lifecycle;

create function private.agency_initialize_employee() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.employee_employment_lifecycle(employee_id,agency_id) values(new.id,new.agency_id);
 insert into public.employee_agency_operations(employee_id,agency_id) values(new.id,new.agency_id);
 insert into public.employee_employment_episodes(employee_id,agency_id,state,lifecycle_revision) values(new.id,new.agency_id,'CURRENT',1);
 return new;
end $$;
create trigger agency_initialize_employee after insert on public.employees for each row execute function private.agency_initialize_employee();

-- Complete HR records remain authoritative. This trigger also covers old HR RPCs.
create function private.agency_sync_hr_operations() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.employee_agency_operations(employee_id,agency_id,job_title,department_id,site_id,team_id)
 values(new.employee_id,new.agency_id,new.job_title,new.department_id,new.site_id,new.team_id)
 on conflict(employee_id) do update set job_title=excluded.job_title,department_id=excluded.department_id,site_id=excluded.site_id,team_id=excluded.team_id,
 revision=employee_agency_operations.revision+1,updated_at=now()
 where row(employee_agency_operations.job_title,employee_agency_operations.department_id,employee_agency_operations.site_id,employee_agency_operations.team_id)
 is distinct from row(excluded.job_title,excluded.department_id,excluded.site_id,excluded.team_id);
 return new;
end $$;
create trigger agency_sync_hr_operations after insert or update on public.employee_hr_records for each row execute function private.agency_sync_hr_operations();

create function private.agency_require_actor(p_actor_id uuid,p_agency_id uuid) returns public.profiles
language plpgsql security definer set search_path=pg_catalog as $$
declare a public.profiles;
begin
 select * into a from public.profiles where id=p_actor_id and is_active for share;
 if not found or a.role not in ('agency_manager','hr_central','super_admin') then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.agencies where id=p_agency_id and is_active for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if a.role='agency_manager' then
  perform 1 from public.agency_memberships where profile_id=a.id and agency_id=p_agency_id for share;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
 end if;
 return a;
end $$;
create function private.agency_can_read(p_agency_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.profiles p join public.agencies a on a.id=p_agency_id and a.is_active
 where p.id=private.current_profile_id() and p.is_active and
 (p.role in ('hr_central','super_admin') or (p.role='agency_manager' and exists(select 1 from public.agency_memberships m where m.profile_id=p.id and m.agency_id=a.id))))
$$;
create function private.agency_employee_event(p_actor_id uuid,p_employee_id uuid,p_action text,p_result text default 'SUCCESS') returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.agency_employee_events(employee_id,agency_id,actor_profile_id,actor_role,action,result,employee_revision,lifecycle_revision)
 select e.id,e.agency_id,p.id,p.role,p_action,p_result,e.revision,l.revision from public.employees e
 join public.employee_employment_lifecycle l on l.employee_id=e.id join public.profiles p on p.id=p_actor_id where e.id=p_employee_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
end $$;

create function private.agency_employee_event_details(p_actor_id uuid,p_employee_id uuid,p_action text,p_before_revision integer,p_before_lifecycle_revision integer,p_before_operational_revision integer,p_changed_fields text[],p_reason text,p_result text default 'SUCCESS') returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.agency_employee_events(employee_id,agency_id,actor_profile_id,actor_role,action,employee_revision,lifecycle_revision,before_employee_revision,before_lifecycle_revision,operational_revision,before_operational_revision,changed_fields,reason,result)
 select e.id,e.agency_id,p.id,p.role,p_action,e.revision,l.revision,p_before_revision,p_before_lifecycle_revision,(select revision from public.employee_agency_operations where employee_id=e.id),p_before_operational_revision,p_changed_fields,btrim(p_reason),p_result
 from public.employees e join public.employee_employment_lifecycle l on l.employee_id=e.id join public.profiles p on p.id=p_actor_id where e.id=p_employee_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
end $$;

create function public.agency_create_employee(p_actor_id uuid,p_agency_id uuid,p_matricule text,p_email text,p_full_name text) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare a public.profiles; eid uuid;
begin
 -- Match import lock ordering: global profile table before actor row locks.
 lock table public.profiles in share row exclusive mode;
 a:=private.agency_require_actor(p_actor_id,p_agency_id);
 if p_matricule is null or length(private.canonical_employee_id(p_matricule)) not between 1 and 80 or p_full_name is null or length(btrim(p_full_name)) not between 1 and 160
 or p_email is null or length(btrim(p_email))>254 or position('@' in btrim(p_email))<2 then raise exception 'invalid_input' using errcode='22023'; end if;
 -- Serialize profile creation checks with imports/provisioning. Existing accounts
 -- require the explicit HR identity workflow; never attach by email here.
 if a.role='agency_manager' and exists(select 1 from public.profiles where email=lower(btrim(p_email))) then
  raise exception 'identity_requires_hr_review' using errcode='PT409';
 end if;
 insert into public.employees(agency_id,employee_id,email,full_name) values(p_agency_id,p_matricule,lower(btrim(p_email)),btrim(p_full_name)) returning id into eid;
 perform private.agency_employee_event(a.id,eid,'employee.created');
 return eid;
end $$;

create function public.agency_save_employee(p_actor_id uuid,p_employee_id uuid,p_revision integer,p_operational_revision integer,p_full_name text,p_job_title text,
 p_department_id uuid,p_site_id uuid,p_team_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.employees; o public.employee_agency_operations; a public.profiles; r public.employee_hr_records; changed boolean;
begin
 select * into e from public.employees where id=p_employee_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 a:=private.agency_require_actor(p_actor_id,e.agency_id);
 select * into e from public.employees where id=p_employee_id for update;
 perform private.agency_require_actor(p_actor_id,e.agency_id);
 select * into o from public.employee_agency_operations where employee_id=e.id for update;
 if e.revision is distinct from p_revision or o.revision is distinct from p_operational_revision then raise exception 'stale_revision' using errcode='PT409'; end if;
 if p_full_name is null or length(btrim(p_full_name)) not between 1 and 160 or p_reason is null or length(btrim(p_reason)) not between 1 and 300
 or (p_job_title is not null and length(btrim(p_job_title)) not between 1 and 160) then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_department_id is not null then
  perform 1 from public.hr_departments where id=p_department_id and agency_id=e.agency_id and is_active for share;
  if not found then raise exception 'invalid_department' using errcode='22023'; end if;
 end if;
 if p_site_id is not null then
  perform 1 from public.hr_sites where id=p_site_id and agency_id=e.agency_id and is_active for share;
  if not found then raise exception 'inactive_site' using errcode='22023'; end if;
 end if;
 if p_team_id is not null then
  perform 1 from public.hr_teams where id=p_team_id and site_id=p_site_id and is_active for share;
  if not found then raise exception 'invalid_team' using errcode='22023'; end if;
 end if;
 changed:=row(e.full_name,o.job_title,o.department_id,o.site_id,o.team_id) is distinct from row(btrim(p_full_name),btrim(p_job_title),p_department_id,p_site_id,p_team_id);
 if not changed then return; end if;
 select * into r from public.employee_hr_records where employee_id=e.id for update;
 if found then
  if p_job_title is null or p_department_id is null or p_site_id is null then raise exception 'complete_hr_record_required' using errcode='22023'; end if;
  update public.employee_hr_records set job_title=btrim(p_job_title),department_id=p_department_id,site_id=p_site_id,team_id=p_team_id,revision=revision+1,updated_at=now() where employee_id=e.id;
 else
  update public.employee_agency_operations set job_title=btrim(p_job_title),department_id=p_department_id,site_id=p_site_id,team_id=p_team_id,revision=revision+1,updated_at=now() where employee_id=e.id;
 end if;
 update public.employees set full_name=btrim(p_full_name) where id=e.id;
 perform private.agency_employee_event_details(a.id,e.id,'employee.updated',e.revision,null,o.revision,array_remove(array[case when e.full_name is distinct from btrim(p_full_name) then 'full_name' end,case when o.job_title is distinct from btrim(p_job_title) then 'job_title' end,case when o.department_id is distinct from p_department_id then 'department_id' end,case when o.site_id is distinct from p_site_id then 'site_id' end,case when o.team_id is distinct from p_team_id then 'team_id' end],null),p_reason);
end $$;

create function public.agency_depart_employee(p_actor_id uuid,p_employee_id uuid,p_revision integer,p_lifecycle_revision integer,p_departed_on date,p_reason text) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.employees; l public.employee_employment_lifecycle; a public.profiles;
begin
 select * into e from public.employees where id=p_employee_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 a:=private.agency_require_actor(p_actor_id,e.agency_id);
 select * into e from public.employees where id=p_employee_id for update;
 perform private.agency_require_actor(p_actor_id,e.agency_id);
 select * into l from public.employee_employment_lifecycle where employee_id=e.id for update;
 if e.revision is distinct from p_revision or l.revision is distinct from p_lifecycle_revision then raise exception 'stale_revision' using errcode='PT409'; end if;
 if p_departed_on is null or p_departed_on>(now() at time zone 'Indian/Antananarivo')::date or p_reason is null or length(btrim(p_reason)) not between 1 and 300
 or (l.started_on is not null and p_departed_on<l.started_on) then raise exception 'invalid_input' using errcode='22023'; end if;
 if l.state='DEPARTED' then raise exception 'lifecycle_conflict' using errcode='PT409'; end if;
 -- Parent employee UPDATE lock serializes new planning writes (their FK/share lock).
 if exists(select 1 from public.hr_assignments where employee_id=e.id and status<>'ENDED' and (end_date is null or end_date>=p_departed_on))
 or exists(select 1 from public.hr_replacements where (replacement_employee_id=e.id or absent_employee_id=e.id) and status<>'CANCELLED' and end_date>=p_departed_on)
 or exists(select 1 from public.leave_requests where employee_id=e.id and status in ('PENDING','APPROVED') and end_date>=p_departed_on) then
  raise exception 'lifecycle_conflict' using errcode='PT409';
 end if;
 update public.employee_employment_lifecycle set state='DEPARTED',departed_on=p_departed_on,departure_reason=btrim(p_reason),revision=revision+1,updated_at=now() where employee_id=e.id;
 insert into public.employee_employment_episodes(employee_id,agency_id,state,effective_on,lifecycle_revision,actor_profile_id) values(e.id,e.agency_id,'DEPARTED',p_departed_on,l.revision+1,a.id);
 perform private.agency_employee_event_details(a.id,e.id,'employee.departed',e.revision,l.revision,null,array['state','departed_on'],p_reason);
end $$;

create function public.agency_request_employee_change(p_actor_id uuid,p_employee_id uuid,p_revision integer,p_lifecycle_revision integer,p_kind text,p_requested_value text,p_reason text) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.employees; l public.employee_employment_lifecycle; a public.profiles; rid uuid; val text:=btrim(p_requested_value);
begin
 select * into e from public.employees where id=p_employee_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 a:=private.agency_require_actor(p_actor_id,e.agency_id);
 select * into e from public.employees where id=p_employee_id for update;
 perform private.agency_require_actor(p_actor_id,e.agency_id);
 select * into l from public.employee_employment_lifecycle where employee_id=e.id for update;
 if e.revision is distinct from p_revision or l.revision is distinct from p_lifecycle_revision then raise exception 'stale_revision' using errcode='PT409'; end if;
 if p_kind is null or p_kind not in ('RETURN','MATRICULE','EMAIL','MANAGER') or val is null or length(val)>300 or p_reason is null or length(btrim(p_reason)) not between 1 and 300 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_kind='RETURN' then
  if l.state<>'DEPARTED' or val!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_input' using errcode='22023'; end if;
  if val::date<l.departed_on or val::date>(now() at time zone 'Indian/Antananarivo')::date then raise exception 'invalid_input' using errcode='22023'; end if;
 elsif p_kind='MATRICULE' then
  val:=private.canonical_employee_id(val);
  if val is null or length(val) not between 1 and 80 then raise exception 'invalid_input' using errcode='22023'; end if;
 elsif p_kind='EMAIL' then
  val:=lower(val);
  if length(val)>254 or position('@' in val)<2 or val=e.email then raise exception 'invalid_input' using errcode='22023'; end if;
 elsif p_kind='MANAGER' and val<>'' then
  perform 1 from public.profiles p where p.id=val::uuid and p.is_active and p.role='team_manager' and exists(select 1 from public.hr_scopes s where s.profile_id=p.id and s.agency_id=e.agency_id);
  if not found then raise exception 'invalid_manager' using errcode='22023'; end if;
 end if;
 insert into public.agency_employee_change_requests(employee_id,agency_id,kind,requested_value,previous_value,hr_revision,reason,employee_revision,lifecycle_revision,created_by)
 values(e.id,e.agency_id,p_kind,val,case p_kind when 'EMAIL' then e.email when 'MATRICULE' then e.employee_id when 'MANAGER' then (select manager_profile_id::text from public.employee_hr_records where employee_id=e.id) else l.state end,(select revision from public.employee_hr_records where employee_id=e.id),btrim(p_reason),e.revision,l.revision,a.id) returning id into rid;
 perform private.agency_employee_event(a.id,e.id,'employee.'||lower(p_kind)||'_requested');
 return rid;
end $$;

create function public.hr_decide_employee_change(p_actor_id uuid,p_request_id uuid,p_revision integer,p_approve boolean,p_reason text) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare a public.profiles:=private.hr_require_hr_actor(p_actor_id); q public.agency_employee_change_requests; e public.employees; l public.employee_employment_lifecycle; r public.employee_hr_records; v text;
begin
 select * into q from public.agency_employee_change_requests where id=p_request_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform private.agency_require_actor(p_actor_id,q.agency_id);
 select * into e from public.employees where id=q.employee_id for update;
 select * into l from public.employee_employment_lifecycle where employee_id=e.id for update;
 select * into q from public.agency_employee_change_requests where id=p_request_id for update;
 if q.revision is distinct from p_revision or q.status<>'PENDING' then raise exception 'stale_revision' using errcode='PT409'; end if;
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 300 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_approve then
  if q.employee_revision<>e.revision or q.lifecycle_revision<>l.revision then raise exception 'stale_revision' using errcode='PT409'; end if;
  v:=q.requested_value;
  if q.kind='RETURN' then
   if l.state<>'DEPARTED' or v::date<l.departed_on or v::date>(now() at time zone 'Indian/Antananarivo')::date then raise exception 'lifecycle_conflict' using errcode='PT409'; end if;
   if exists(select 1 from public.employee_hr_records where employee_id=e.id and (status in ('INACTIVE','CONTRACT_ENDED') or contract_start>v::date or (contract_end is not null and contract_end<v::date))) then raise exception 'contract_conflict' using errcode='PT409'; end if;
   update public.employee_employment_lifecycle set state='CURRENT',started_on=v::date,departed_on=null,departure_reason=null,revision=revision+1,updated_at=now() where employee_id=e.id;
   insert into public.employee_employment_episodes(employee_id,agency_id,state,effective_on,lifecycle_revision,actor_profile_id) values(e.id,e.agency_id,'CURRENT',v::date,l.revision+1,a.id);
  elsif q.kind='MATRICULE' then
   -- Existing pending payroll/invitation records must first be resolved by HR.
   if exists(select 1 from public.employee_invitations i where i.agency_id=e.agency_id and i.employee_id=e.employee_id and i.status='PENDING')
    or exists(select 1 from public.payroll_import_rows x join public.payroll_imports i on i.id=x.import_id where i.agency_id=e.agency_id and x.employee_id=e.employee_id and i.status not in ('PUBLISHED','SUPERSEDED')) then
    raise exception 'identity_dependencies' using errcode='PT409';
   end if;
   update public.employees set employee_id=v where id=e.id;
  elsif q.kind='MANAGER' then
   select * into r from public.employee_hr_records where employee_id=e.id for update;
   if not found then raise exception 'complete_hr_record_required' using errcode='22023'; end if;
   if q.hr_revision is distinct from r.revision then raise exception 'stale_revision' using errcode='PT409'; end if;
   perform private.hr_validate_record(e.agency_id,r.job_title,r.department_id,r.site_id,r.team_id,nullif(v,'')::uuid,r.status,r.contract_type,r.contract_start,r.contract_end);
   if v<>'' and not private.hr_profile_scope_allows(v::uuid,e.agency_id,r.department_id,r.site_id) then raise exception 'invalid_manager' using errcode='22023'; end if;
   update public.employee_hr_records set manager_profile_id=nullif(v,'')::uuid,revision=revision+1,updated_at=now() where employee_id=e.id;
  elsif q.kind='EMAIL' then
   if exists(select 1 from public.employees x where x.agency_id=e.agency_id and x.email=v and x.id<>e.id)
    or exists(select 1 from public.profiles p where p.email=v and p.id is distinct from e.profile_id) then raise exception 'email_collision' using errcode='23505'; end if;
   -- Auth proof and durable external workflow execute this separately.
  end if;
 end if;
 update public.agency_employee_change_requests set status=case when not p_approve then 'REJECTED' when q.kind='EMAIL' then 'APPROVED_PENDING_VERIFICATION' else 'EXECUTED' end,
 revision=revision+1,decided_by=a.id,decided_at=now(),decision_reason=btrim(p_reason) where id=q.id;
 perform private.agency_employee_event_details(a.id,e.id,'employee.'||lower(q.kind)||'_decided',e.revision,l.revision,
  (select revision from public.employee_agency_operations where employee_id=e.id),
  case when not p_approve or q.kind='EMAIL' then '{}'::text[] when q.kind='RETURN' then array['state','started_on'] when q.kind='MATRICULE' then array['employee_id'] else array['manager_profile_id'] end,
  p_reason,case when not p_approve then 'REJECTED' when q.kind='EMAIL' then 'APPROVED_PENDING_VERIFICATION' else 'APPROVED' end);
end $$;

-- Minimal session projections. No private table or document is joined here.
create function public.agency_employee_directory(p_agency_id uuid default null,p_search text default null,p_state text default null,p_employee_id uuid default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select e.id,e.agency_id,e.employee_id as matricule,e.email,e.full_name,e.is_active,e.profile_id is not null as has_access,e.revision,
 l.state,l.revision as lifecycle_revision,l.started_on,l.departed_on,l.departure_reason,o.revision as operational_revision,
 r.employee_id is not null as has_hr_record,o.job_title,o.department_id,d.name as department_name,o.site_id,s.name as site_name,o.team_id,t.name as team_name,
 r.manager_profile_id,m.full_name as manager_name,r.contract_type,r.contract_start,r.contract_end,count(*) over() as total_count
 from public.employees e join public.employee_employment_lifecycle l on l.employee_id=e.id join public.employee_agency_operations o on o.employee_id=e.id
 left join public.employee_hr_records r on r.employee_id=e.id left join public.hr_departments d on d.id=o.department_id
 left join public.hr_sites s on s.id=o.site_id left join public.hr_teams t on t.id=o.team_id left join public.profiles m on m.id=r.manager_profile_id
 where private.agency_can_read(e.agency_id) and (p_agency_id is null or e.agency_id=p_agency_id)
 and (p_employee_id is null or e.id=p_employee_id)
 and (case when p_state is not null then l.state=p_state when p_employee_id is not null then true else l.state<>'DEPARTED' end)
 and (nullif(btrim(p_search),'') is null or strpos(lower(e.full_name),lower(left(btrim(p_search),160)))>0 or strpos(lower(e.employee_id),lower(left(btrim(p_search),160)))>0)
 order by e.full_name,e.id limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0)) x
$$;
create function public.agency_employee_options(p_agency_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select case when not private.agency_can_read(p_agency_id) then '{}'::jsonb else jsonb_build_object(
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.hr_departments where agency_id=p_agency_id and is_active),
 'sites',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.hr_sites where agency_id=p_agency_id and is_active),
 'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'site_id',t.site_id) order by t.name),'[]'::jsonb) from public.hr_teams t join public.hr_sites s on s.id=t.site_id where s.agency_id=p_agency_id and s.is_active and t.is_active),
 'managers',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) order by p.full_name),'[]'::jsonb) from public.profiles p where p.is_active and p.role='team_manager' and exists(select 1 from public.hr_scopes s where s.profile_id=p.id and s.agency_id=p_agency_id))) end
$$;
create function public.agency_employee_history(p_employee_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select ev.id,ev.action,ev.actor_profile_id,p.full_name as actor_name,ev.actor_role,ev.created_at,ev.employee_revision,ev.lifecycle_revision,ev.before_employee_revision,ev.before_lifecycle_revision,ev.operational_revision,ev.before_operational_revision,ev.changed_fields,ev.result from public.agency_employee_events ev left join public.profiles p on p.id=ev.actor_profile_id
 where ev.employee_id=p_employee_id and private.agency_can_read(ev.agency_id) and ev.expires_at>now() order by ev.created_at desc,ev.id limit 200) x
$$;
create function public.agency_employee_requests(p_employee_id uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 with scoped as materialized (
 select * from public.agency_employee_change_requests q
 where (p_employee_id is null or q.employee_id=p_employee_id) and private.agency_can_read(q.agency_id)
 ), selected as (
 select * from scoped where status in ('PENDING','APPROVED_PENDING_VERIFICATION')
 union all
 (select * from scoped where status not in ('PENDING','APPROVED_PENDING_VERIFICATION') order by created_at desc,id limit 500)
 )
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select q.id,q.employee_id,q.agency_id,q.kind,q.requested_value,q.previous_value,q.reason,q.status,q.revision,q.employee_revision,q.lifecycle_revision,q.created_by,q.created_at,q.decided_by,q.decided_at,q.decision_reason,
 e.full_name as employee_name,e.employee_id as matricule,a.name as agency_name,author.full_name as created_by_name,
 case q.kind when 'EMAIL' then e.email when 'MATRICULE' then e.employee_id when 'MANAGER' then mgr.full_name else l.state end as current_value,
 case when q.kind='MANAGER' then coalesce(requested_mgr.full_name,'Aucun') else q.requested_value end as requested_display_value,
 l.departed_on,r.contract_type,r.contract_start,r.contract_end
 from selected q join public.employees e on e.id=q.employee_id join public.agencies a on a.id=q.agency_id
 join public.profiles author on author.id=q.created_by join public.employee_employment_lifecycle l on l.employee_id=e.id
 left join public.employee_hr_records r on r.employee_id=e.id left join public.profiles mgr on mgr.id=r.manager_profile_id
 left join public.profiles requested_mgr on requested_mgr.id=case when q.kind='MANAGER' then nullif(q.requested_value,'')::uuid else null end
 order by (q.status in ('PENDING','APPROVED_PENDING_VERIFICATION')) desc,q.created_at desc,q.id) x
$$;

-- Revalidate planning even through old RPCs / service paths. Departure does not
-- alter contracts, leave, assignments or access; unresolved conflicts stay visible.
create function private.agency_guard_planning_employee() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[]; eid uuid;
begin
 if tg_table_name='hr_assignments' then
  if new.status='ENDED' then return new; end if;
  ids:=array[new.employee_id];
 elsif tg_table_name='hr_replacements' then
  if new.status='CANCELLED' then return new; end if;
  ids:=array[new.absent_employee_id,new.replacement_employee_id];
 else
  if new.status not in ('PENDING','APPROVED') then return new; end if;
  ids:=array[new.employee_id];
 end if;
 for eid in select distinct x from unnest(ids) x where x is not null order by x loop
  perform 1 from public.employees where id=eid for share;
  if exists(select 1 from public.employee_employment_lifecycle where employee_id=eid and state='DEPARTED') then raise exception 'departed_employee' using errcode='PT409'; end if;
 end loop;
 return new;
end $$;
create trigger agency_guard_assignment before insert or update on public.hr_assignments for each row execute function private.agency_guard_planning_employee();
create trigger agency_guard_replacement before insert or update on public.hr_replacements for each row execute function private.agency_guard_planning_employee();
create trigger agency_guard_leave before insert or update on public.leave_requests for each row execute function private.agency_guard_planning_employee();

create function private.purge_agency_employee_events(p_now timestamptz default now()) returns bigint language plpgsql security definer set search_path=pg_catalog as $$
declare n bigint;
begin
 delete from public.agency_employee_events where expires_at<=p_now;
 get diagnostics n=row_count; return n;
end $$;
select cron.schedule('agency-employee-audit-retention','20 4 * * *',$job$set statement_timeout='120s'; set lock_timeout='5s'; select private.purge_agency_employee_events();$job$);

-- Tables are never exposed directly. Only explicit, scoped session projections.
alter table public.employee_employment_lifecycle enable row level security;
alter table public.employee_agency_operations enable row level security;
alter table public.employee_employment_episodes enable row level security;
alter table public.agency_employee_change_requests enable row level security;
alter table public.agency_employee_events enable row level security;
revoke all on public.employee_employment_lifecycle,public.employee_agency_operations,public.employee_employment_episodes,public.agency_employee_change_requests,public.agency_employee_events from public,anon,authenticated;
grant all on public.employee_employment_lifecycle,public.employee_agency_operations,public.employee_employment_episodes,public.agency_employee_change_requests,public.agency_employee_events to service_role;

revoke all on function private.employee_identity_revision(),private.agency_initialize_employee(),private.agency_sync_hr_operations(),private.agency_guard_planning_employee(),private.purge_agency_employee_events(timestamptz) from public,anon,authenticated,service_role;
revoke all on function private.agency_employee_event_details(uuid,uuid,text,integer,integer,integer,text[],text,text) from public,anon,authenticated;
grant execute on function private.agency_employee_event_details(uuid,uuid,text,integer,integer,integer,text[],text,text) to service_role;
revoke all on function private.agency_require_actor(uuid,uuid),private.agency_employee_event(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.agency_require_actor(uuid,uuid),private.agency_employee_event(uuid,uuid,text,text) to service_role;
revoke all on function private.agency_can_read(uuid) from public,anon,authenticated;
revoke all on function public.agency_create_employee(uuid,uuid,text,text,text),public.agency_save_employee(uuid,uuid,integer,integer,text,text,uuid,uuid,uuid,text),public.agency_depart_employee(uuid,uuid,integer,integer,date,text),public.agency_request_employee_change(uuid,uuid,integer,integer,text,text,text),public.hr_decide_employee_change(uuid,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.agency_create_employee(uuid,uuid,text,text,text),public.agency_save_employee(uuid,uuid,integer,integer,text,text,uuid,uuid,uuid,text),public.agency_depart_employee(uuid,uuid,integer,integer,date,text),public.agency_request_employee_change(uuid,uuid,integer,integer,text,text,text),public.hr_decide_employee_change(uuid,uuid,integer,boolean,text) to service_role;
revoke all on function public.agency_employee_directory(uuid,text,text,uuid,integer,integer),public.agency_employee_options(uuid),public.agency_employee_history(uuid),public.agency_employee_requests(uuid) from public,anon;
grant execute on function public.agency_employee_directory(uuid,text,text,uuid,integer,integer),public.agency_employee_options(uuid),public.agency_employee_history(uuid),public.agency_employee_requests(uuid) to authenticated,service_role;
