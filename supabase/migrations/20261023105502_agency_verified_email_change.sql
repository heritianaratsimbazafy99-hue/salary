-- Email changes never reassign an employee to a profile inferred from an address.
create table public.employee_email_verifications (
 request_id uuid primary key references public.agency_employee_change_requests(id) on delete cascade,
 employee_id uuid not null references public.employees(id), profile_id uuid references public.profiles(id),
 old_email text not null, new_email text not null,
 token_hash text unique, expires_at timestamptz, requested_at timestamptz not null default now(),
 completed_at timestamptz, auth_request_in_flight boolean not null default false, auth_attempt_id uuid not null default gen_random_uuid(),
 check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$')
);
create unique index employee_email_verifications_target on public.employee_email_verifications(new_email) where completed_at is null;
alter table public.employee_email_verifications enable row level security;
revoke all on public.employee_email_verifications from anon,authenticated;
grant all on public.employee_email_verifications to service_role;

-- Privileged Auth reads return only the fields needed by this workflow.
-- service_role deliberately has no direct SELECT privilege on auth.users.
create function private.employee_email_auth_collision(p_email text,p_excluded_user uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from auth.users u where lower(u.email)=p_email and u.id is distinct from p_excluded_user)
$$;
create function private.employee_email_auth_state(p_auth_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 select jsonb_build_object('email',lower(u.email),'confirmed',u.email_confirmed_at is not null,'pending',coalesce(u.email_change,'')<>'')
 into result from auth.users u where u.id=p_auth_user_id for share;
 return result;
end $$;
revoke all on function private.employee_email_auth_collision(text,uuid),private.employee_email_auth_state(uuid) from public,anon,authenticated;
grant execute on function private.employee_email_auth_collision(text,uuid),private.employee_email_auth_state(uuid) to service_role;

create function public.begin_employee_email_change(p_request_id uuid,p_actor_id uuid,p_token_hash text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare q public.agency_employee_change_requests; e public.employees; p public.profiles; v public.employee_email_verifications; a public.profiles;
begin
 select * into q from public.agency_employee_change_requests where id=p_request_id and kind='EMAIL';
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into a from public.profiles where id=p_actor_id and is_active for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 select * into e from public.employees where id=q.employee_id for update;
 select * into p from public.profiles where id=e.profile_id for update;
 if not e.is_active or not exists(select 1 from public.agencies where id=e.agency_id and is_active) then raise exception 'access_inactive' using errcode='42501'; end if;
 if e.profile_id is null then
  perform private.hr_require_hr_actor(p_actor_id);
  perform private.agency_require_actor(p_actor_id,e.agency_id);
 else
  if p.id is distinct from a.id or p.role<>'employee' or not p.is_active or p.auth_user_id is null then raise exception 'owner_required' using errcode='42501'; end if;
  if (select count(*) from public.employees where profile_id=p.id)<>1 then raise exception 'multi_employment_hr_arbitration' using errcode='PT409'; end if;
 end if;
 perform 1 from public.employee_employment_lifecycle where employee_id=e.id for update;
 select * into q from public.agency_employee_change_requests where id=p_request_id for update;
 select * into v from public.employee_email_verifications where request_id=q.id for update;
 if q.status='EXECUTED' and v.completed_at is not null then return jsonb_build_object('completed',true); end if;
 if q.status<>'APPROVED_PENDING_VERIFICATION' or (v.request_id is null and (q.employee_revision<>e.revision or q.lifecycle_revision<>(select revision from public.employee_employment_lifecycle where employee_id=e.id))) then raise exception 'stale_revision' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('employee-email:'||q.requested_value,0));
 if exists(select 1 from public.employees x where x.email=q.requested_value and x.id<>e.id)
 or exists(select 1 from public.profiles x where x.email=q.requested_value and x.id is distinct from e.profile_id)
 or private.employee_email_auth_collision(q.requested_value,p.auth_user_id) then raise exception 'email_collision' using errcode='23505'; end if;
 if v.profile_id is not null and v.auth_request_in_flight and v.completed_at is null then raise exception 'auth_outcome_unknown' using errcode='PT409'; end if;
 if v.request_id is not null and v.requested_at>now()-interval '60 seconds' then raise exception 'rate_limited' using errcode='PT429'; end if;
 if e.profile_id is null and (p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$') then raise exception 'invalid_proof' using errcode='22023'; end if;
 insert into public.employee_email_verifications(request_id,employee_id,profile_id,old_email,new_email,token_hash,expires_at,auth_request_in_flight)
 values(q.id,e.id,e.profile_id,e.email,q.requested_value,case when e.profile_id is null then p_token_hash end,now()+interval '30 minutes',e.profile_id is not null)
 on conflict(request_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,requested_at=now(),auth_request_in_flight=excluded.auth_request_in_flight,auth_attempt_id=excluded.auth_attempt_id;
 -- Only one REVOKED row can exist per employee in the legacy schema.
 delete from public.employee_invitations where agency_id=e.agency_id and employee_id=e.employee_id and status='REVOKED';
 update public.employee_invitations set status='REVOKED',updated_at=now() where agency_id=e.agency_id and employee_id=e.employee_id and status='PENDING';
 update public.agency_invitation_jobs set status='SKIPPED',lease_until=null where employee_id=e.id and status in ('PENDING','SENDING','FAILED');
 perform private.agency_employee_event(a.id,e.id,'employee.email_verification_requested','PENDING');
 return jsonb_build_object('completed',false,'email',q.requested_value,'linked',e.profile_id is not null,'attemptId',(select auth_attempt_id from public.employee_email_verifications where request_id=q.id));
end $$;

create function public.complete_employee_email_change(p_request_id uuid,p_auth_user_id uuid default null,p_token_hash text default null,p_reconciliation_actor_id uuid default null)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v public.employee_email_verifications; q public.agency_employee_change_requests; e public.employees; p public.profiles; auth_state jsonb;
begin
 select * into v from public.employee_email_verifications where request_id=p_request_id;
 if not found then raise exception 'invalid_proof' using errcode='42501'; end if;
 select * into e from public.employees where id=v.employee_id for update;
 if p_reconciliation_actor_id is not null then
  perform private.hr_require_hr_actor(p_reconciliation_actor_id);
  -- Reconciliation can repair an identity after access or agency deactivation.
 elsif not e.is_active or not exists(select 1 from public.agencies where id=e.agency_id and is_active) then raise exception 'access_inactive' using errcode='42501'; end if;
 if e.profile_id is not null then select * into p from public.profiles where id=e.profile_id for update; end if;
 perform 1 from public.employee_employment_lifecycle where employee_id=e.id for update;
 select * into q from public.agency_employee_change_requests where id=p_request_id for update;
 select * into v from public.employee_email_verifications where request_id=p_request_id for update;
 if v.profile_id is not null then
  if p.auth_user_id is distinct from p_auth_user_id or p.id is distinct from v.profile_id or p.role<>'employee' then raise exception 'invalid_proof' using errcode='42501'; end if;
  if (select count(*) from public.employees where profile_id=p.id)<>1 then raise exception 'multi_employment_hr_arbitration' using errcode='PT409'; end if;
  auth_state:=private.employee_email_auth_state(p_auth_user_id);
  if auth_state is null or auth_state->>'email' is distinct from v.new_email or not (auth_state->>'confirmed')::boolean or (auth_state->>'pending')::boolean then raise exception 'verification_pending' using errcode='PT409'; end if;
 else
  if p_token_hash is null or v.token_hash is distinct from p_token_hash then raise exception 'invalid_proof' using errcode='42501'; end if;
  if e.profile_id is not null then raise exception 'identity_changed' using errcode='PT409'; end if;
 end if;
 -- A replay proves possession again but performs no second write or audit event.
 if v.completed_at is not null and q.status='EXECUTED' then return true; end if;
 if v.profile_id is null and v.expires_at<=now() then raise exception 'expired_proof' using errcode='42501'; end if;
 if q.status<>'APPROVED_PENDING_VERIFICATION' or e.email<>v.old_email then raise exception 'stale_revision' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('employee-email:'||v.new_email,0));
 if exists(select 1 from public.employees x where x.email=v.new_email and x.id<>e.id)
 or exists(select 1 from public.profiles x where x.email=v.new_email and x.id is distinct from v.profile_id)
 or private.employee_email_auth_collision(v.new_email,p.auth_user_id) then raise exception 'email_collision' using errcode='23505'; end if;
 update public.employee_email_verifications set completed_at=now() where request_id=q.id;
 update public.agency_employee_change_requests set status='EXECUTED',revision=revision+1 where id=q.id;
 if v.profile_id is not null then update public.profiles set email=v.new_email where id=v.profile_id; end if;
 update public.employees set email=v.new_email where id=e.id;
 perform private.agency_employee_event(coalesce(v.profile_id,q.decided_by),e.id,'employee.email_verified');
 return true;
end $$;

-- Freeze only identity fields while an external Auth operation is in flight.
-- Name, access suspension, departure, and all HR operations remain available.
create function private.guard_employee_email_verification() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.email is not distinct from old.email and new.profile_id is not distinct from old.profile_id then return new; end if;
 if exists(select 1 from public.employee_email_verifications v where v.completed_at is null
  and (v.profile_id is not null or v.expires_at>now())
  and (v.employee_id=old.id or (v.profile_id is not null and v.profile_id=new.profile_id))) then
  raise exception 'email_verification_pending' using errcode='PT409';
 end if;
 return new;
end $$;
create trigger guard_employee_email_change before update on public.employees for each row execute function private.guard_employee_email_verification();
-- INSERT links also cannot expand an identity while its email is being verified.
create function private.guard_email_profile_link() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.profile_id is not null then perform 1 from public.profiles where id=new.profile_id for update; end if;
 if new.profile_id is not null and exists(select 1 from public.employee_email_verifications where profile_id=new.profile_id and completed_at is null) then raise exception 'email_verification_pending' using errcode='PT409'; end if; return new;
end $$;
create trigger guard_email_profile_link before insert on public.employees for each row execute function private.guard_email_profile_link();
revoke all on function public.begin_employee_email_change(uuid,uuid,text),public.complete_employee_email_change(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_employee_email_change(uuid,uuid,text),public.complete_employee_email_change(uuid,uuid,text,uuid) to service_role;


-- Reconciliation never forces an Auth email. If Auth already completed, finish
-- the DB transaction; if no Auth change remains outstanding, safely cancel.
create function public.reconcile_employee_email_change(p_actor_id uuid,p_request_id uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare q public.agency_employee_change_requests; v public.employee_email_verifications; e public.employees; u jsonb; p public.profiles;
begin
 perform private.hr_require_hr_actor(p_actor_id);
 select * into q from public.agency_employee_change_requests where id=p_request_id and kind='EMAIL';
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform 1 from public.agencies where id=q.agency_id for share;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into e from public.employees where id=q.employee_id for update;
 select * into p from public.profiles where id=e.profile_id for update;
 select * into q from public.agency_employee_change_requests where id=p_request_id for update;
 select * into v from public.employee_email_verifications where request_id=p_request_id for update;
 if q.status='EXECUTED' and v.completed_at is not null then return 'EXECUTED'; end if;
 if q.status<>'APPROVED_PENDING_VERIFICATION' then raise exception 'stale_revision' using errcode='PT409'; end if;
 if v.profile_id is not null then
  u:=private.employee_email_auth_state(p.auth_user_id);
  if u is null then raise exception 'identity_changed' using errcode='PT409'; end if;
  if u->>'email'=v.new_email and (u->>'confirmed')::boolean and not (u->>'pending')::boolean then
   perform public.complete_employee_email_change(q.id,p.auth_user_id,null,p_actor_id); return 'EXECUTED';
  end if;
  if v.auth_request_in_flight or u->>'email' is distinct from v.old_email or (u->>'pending')::boolean then raise exception 'verification_pending' using errcode='PT409'; end if;
 end if;
 delete from public.employee_email_verifications where request_id=q.id;
 update public.agency_employee_change_requests set status='REJECTED',revision=revision+1,decision_reason='Vérification annulée par les RH',decided_by=p_actor_id,decided_at=now() where id=q.id;
 perform private.agency_employee_event(p_actor_id,e.id,'employee.email_verification_cancelled','CANCELLED');
 return 'CANCELLED';
end $$;
revoke all on function public.reconcile_employee_email_change(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_employee_email_change(uuid,uuid) to service_role;

-- Reuse the existing daily retention job. Expired unlinked proofs unlock their
-- reservation automatically; pending Auth operations require explicit recovery.
create or replace function private.purge_agency_employee_events(p_now timestamptz default now()) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare n bigint; v record;
begin
 for v in select x.request_id,x.employee_id,q.decided_by from public.employee_email_verifications x
  join public.agency_employee_change_requests q on q.id=x.request_id
  where x.profile_id is null and x.completed_at is null and x.expires_at<=p_now
  order by x.employee_id
 loop
  perform 1 from public.employees where id=v.employee_id for update;
  -- Recheck after acquiring the employee lock, before consuming this operation.
  if not exists(select 1 from public.employee_email_verifications where request_id=v.request_id and completed_at is null and expires_at<=p_now) then continue; end if;
  delete from public.employee_email_verifications where request_id=v.request_id;
  update public.agency_employee_change_requests set status='REJECTED',revision=revision+1,decision_reason='Vérification expirée : nouvelle demande nécessaire' where id=v.request_id and status='APPROVED_PENDING_VERIFICATION';
  perform private.agency_employee_event(v.decided_by,v.employee_id,'employee.email_verification_expired','EXPIRED');
 end loop;
 delete from public.employee_email_verifications where completed_at is not null and completed_at<=p_now-interval '12 months';
 delete from public.agency_employee_events where expires_at<=p_now;
 get diagnostics n=row_count; return n;
end $$;

create function public.settle_employee_email_change(p_actor_id uuid,p_request_id uuid,p_attempt_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 update public.employee_email_verifications v set auth_request_in_flight=false
 from public.profiles p where v.request_id=p_request_id and v.auth_attempt_id=p_attempt_id and v.profile_id=p_actor_id and p.id=v.profile_id and v.completed_at is null;
end $$;
revoke all on function public.settle_employee_email_change(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.settle_employee_email_change(uuid,uuid,uuid) to service_role;


-- A reservation covers Auth, profiles and all agencies, not just the originating
-- agency. Every competing identity write shares begin/finalise's advisory lock.
create function private.guard_reserved_employee_email() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_table_name='employees' then
  if tg_op='UPDATE' then
   if new.email is not distinct from old.email and new.profile_id is not distinct from old.profile_id then return new; end if;
  end if;
  if new.profile_id is not null then perform 1 from public.profiles where id=new.profile_id for update; end if;
  perform pg_advisory_xact_lock(hashtextextended('employee-email:'||new.email,0));
  if exists(select 1 from public.employee_email_verifications v where v.new_email=new.email and v.completed_at is null and v.employee_id is distinct from new.id) then
   raise exception 'email_reserved' using errcode='23505';
  end if;
  -- Updates linking an existing second employment share the same profile lock.
  if new.profile_id is not null and exists(select 1 from public.employee_email_verifications v where v.profile_id=new.profile_id and v.completed_at is null and v.employee_id is distinct from new.id) then
   raise exception 'email_verification_pending' using errcode='PT409';
  end if;
 else
  if tg_op='UPDATE' then if new.email is not distinct from old.email then return new; end if; end if;
  perform pg_advisory_xact_lock(hashtextextended('employee-email:'||new.email,0));
  if exists(select 1 from public.employee_email_verifications v where v.completed_at is null and (v.new_email=new.email or v.profile_id=new.id)) then
   raise exception 'email_reserved' using errcode='23505';
  end if;
 end if;
 return new;
end $$;
create trigger guard_reserved_employee_email before insert or update on public.employees for each row execute function private.guard_reserved_employee_email();
create trigger guard_reserved_profile_email before insert or update on public.profiles for each row execute function private.guard_reserved_employee_email();
revoke all on function private.guard_employee_email_verification(),private.guard_email_profile_link(),private.guard_reserved_employee_email() from public,anon,authenticated,service_role;

-- Auth owns this table and runs under supabase_auth_admin. The private trigger
-- has narrow definer privileges solely to inspect our reservation registry.
create function private.guard_reserved_auth_email() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' then if new.email is not distinct from old.email then return new; end if; end if;
 if new.email is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('employee-email:'||lower(new.email),0));
 if exists(select 1 from public.employee_email_verifications v left join public.profiles p on p.id=v.profile_id
  where v.completed_at is null and
   ((v.new_email=lower(new.email) and p.auth_user_id is distinct from new.id)
    or (p.auth_user_id=new.id and v.new_email<>lower(new.email)))) then
  raise exception 'email_reserved' using errcode='23505';
 end if;
 return new;
end $$;
create trigger guard_reserved_auth_email before insert or update on auth.users for each row execute function private.guard_reserved_auth_email();
revoke all on function private.guard_reserved_auth_email() from public,anon,authenticated,service_role;
