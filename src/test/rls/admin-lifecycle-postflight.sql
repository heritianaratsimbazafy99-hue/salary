\set ON_ERROR_STOP on
begin;
-- Isolated, rollback-only postflight: actor authorization, atomic audit and live RLS.
insert into public.agencies(id,name,code) values
('aa000000-0000-4000-8000-000000000001','Lifecycle A','LIFECYCLE-A'),
('aa000000-0000-4000-8000-000000000002','Lifecycle B','LIFECYCLE-B');
insert into auth.users(id,email) values
('ab000000-0000-4000-8000-000000000001','lifecycle-hr@example.test'),
('ab000000-0000-4000-8000-000000000002','lifecycle-manager@example.test'),
('ab000000-0000-4000-8000-000000000003','lifecycle-employee@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','lifecycle-hr@example.test','HR','hr_central'),
('ac000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000002','lifecycle-manager@example.test','Manager','agency_manager'),
('ac000000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-000000000003','lifecycle-employee@example.test','Employee','employee'),
('ac000000-0000-4000-8000-000000000004',null,'lifecycle-super@example.test','Super','super_admin');
insert into public.agency_memberships(profile_id,agency_id) values('ac000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001');
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name) values
('ad000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000003','LIFE-A','lifecycle-employee@example.test','Employee'),
('ad000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000003','LIFE-B','lifecycle-employee@example.test','Employee');
do $$ begin
 if has_function_privilege('authenticated','public.admin_save_manager(uuid,uuid,uuid,text,text,uuid,boolean)','execute') then raise exception 'RPC exposed'; end if;
 if has_table_privilege('authenticated','public.agency_memberships','update') then raise exception 'direct membership writes'; end if;
 begin
  perform public.admin_save_manager('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000004',null,null,'Hijacked','aa000000-0000-4000-8000-000000000001',false);
  raise exception 'superadmin modified';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
 begin
  perform public.admin_save_agency('ac000000-0000-4000-8000-000000000002',null,'Escalated','ESCALATED',true);
  raise exception 'manager elevated';
 exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
set local role service_role;
select public.admin_save_manager('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002',null,null,'Reassigned','aa000000-0000-4000-8000-000000000002',true);
reset role;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"super_admin","agency_id":"aa000000-0000-4000-8000-000000000001"}}',true);
set local role authenticated;
do $$ begin
 if private.current_agency_id() is distinct from 'aa000000-0000-4000-8000-000000000002'::uuid then raise exception 'stale manager scope'; end if;
end $$;
reset role;
select public.admin_save_manager('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002',null,null,'Reassigned','aa000000-0000-4000-8000-000000000002',false);
set local role authenticated;
do $$ begin
 if private.current_profile_id() is not null or exists(select 1 from public.profiles) then raise exception 'disabled manager still authorized'; end if;
end $$;
reset role;
select public.admin_set_employee_access('ac000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.employees) <> 1 then raise exception 'employee leaked other/inactive employment'; end if;
 if private.employee_access_active('ad000000-0000-4000-8000-000000000001') then raise exception 'departed agency available'; end if;
 if not private.employee_access_active('ad000000-0000-4000-8000-000000000002') then raise exception 'other active employment unavailable'; end if;
end $$;
reset role;
select public.admin_set_employee_access('ac000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002',false);
set local role authenticated;
do $$ begin
 if private.current_profile_id() is not null or exists(select 1 from public.profiles) then raise exception 'departed employee still authorized'; end if;
end $$;
reset role;
select public.admin_set_employee_access('ac000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if private.current_profile_id() is null or (select count(*) from public.employees) <> 1 then raise exception 'reactivation failed'; end if;
end $$;
reset role;
select public.admin_save_agency('ac000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Lifecycle A','LIFECYCLE-A',false);
set local role authenticated;
do $$ begin
 if private.current_profile_id() is not null then raise exception 'inactive agency grants access'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_logs where actor_profile_id='ac000000-0000-4000-8000-000000000001') <> 6 then raise exception 'missing lifecycle audit'; end if;
 if (select count(*) from public.employees where profile_id='ac000000-0000-4000-8000-000000000003') <> 2 then raise exception 'employment deleted'; end if;
end $$;
rollback;
