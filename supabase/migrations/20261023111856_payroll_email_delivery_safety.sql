-- A pending request leaves the official address effective until verification.
-- Once Auth has verified another address, never notify the former mailbox in
-- the interval before the business identity transaction is reconciled.
create function public.payroll_email_delivery_allowed(p_agency_id uuid,p_email text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.employees; p public.profiles;
begin
 select * into e from public.employees where agency_id=p_agency_id and email=lower(p_email);
 if not found then return false; end if;
 if not exists(select 1 from public.agency_employee_change_requests q where q.employee_id=e.id and q.kind='EMAIL' and q.status='APPROVED_PENDING_VERIFICATION') then return true; end if;
 if e.profile_id is null then return false; end if;
 select * into p from public.profiles where id=e.profile_id and is_active and role='employee';
 if not found or p.auth_user_id is null then return false; end if;
 return exists(select 1 from auth.users u where u.id=p.auth_user_id and u.email_confirmed_at is not null and lower(u.email)=lower(p_email) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()));
end; $$;
revoke all on function public.payroll_email_delivery_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.payroll_email_delivery_allowed(uuid,text) to service_role;

create function private.guard_pending_email_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='PENDING' and exists(select 1 from public.employees e join public.agency_employee_change_requests q on q.employee_id=e.id where e.agency_id=new.agency_id and e.employee_id=new.employee_id and q.kind='EMAIL' and q.status='APPROVED_PENDING_VERIFICATION') then
  raise exception 'email_verification_pending' using errcode='PT409';
 end if;
 return new;
end; $$;
revoke all on function private.guard_pending_email_invitation() from public,anon,authenticated,service_role;
create trigger employee_invitation_pending_email_guard before insert or update on public.employee_invitations for each row execute function private.guard_pending_email_invitation();
