\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: HR referential RPCs, scope grants, live RLS scopes and revocation.
insert into public.agencies(id,name,code) values
('c1000000-0000-4000-8000-000000000001','HR Airtel','HR-AIRTEL-TEST'),
('c1000000-0000-4000-8000-000000000002','HR Huawei','HR-HUAWEI-TEST');
insert into auth.users(id,email) values
('c2000000-0000-4000-8000-000000000001','hr-test-manager@example.test'),
('c2000000-0000-4000-8000-000000000002','hr-test-client@example.test'),
('c2000000-0000-4000-8000-000000000003','hr-test-payroll@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('c3000000-0000-4000-8000-000000000001',null,'hr-test-central@example.test','RH','hr_central'),
('c3000000-0000-4000-8000-000000000002',null,'hr-test-super@example.test','Super','super_admin'),
('c3000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000003','hr-test-payroll@example.test','Payroll','agency_manager');
insert into public.agency_memberships(profile_id,agency_id) values('c3000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001');
create function pg_temp.reject_hr_audit() returns trigger language plpgsql as $$
begin
 if new.action = 'hr_site.created' and new.metadata->>'code' = 'ROLLBACK' then raise exception 'test audit unavailable'; end if;
 return new;
end $$;
create trigger test_reject_hr_audit before insert on public.audit_logs for each row execute function pg_temp.reject_hr_audit();

do $$
declare
 hr constant uuid := 'c3000000-0000-4000-8000-000000000001';
 super constant uuid := 'c3000000-0000-4000-8000-000000000002';
 payroll constant uuid := 'c3000000-0000-4000-8000-000000000003';
 a constant uuid := 'c1000000-0000-4000-8000-000000000001';
 b constant uuid := 'c1000000-0000-4000-8000-000000000002';
 site_a uuid; site_a2 uuid; site_b uuid; dept_a uuid; dept_b uuid; team uuid; manager uuid; client uuid; stamp timestamptz;
begin
 if has_function_privilege('authenticated','public.hr_save_site(uuid,uuid,uuid,text,text,boolean,integer)','execute')
  or has_function_privilege('authenticated','public.admin_save_hr_access(uuid,uuid,uuid,text,text,public.app_role,boolean,jsonb,timestamptz)','execute')
  or has_function_privilege('authenticated','public.admin_set_hr_access_active(uuid,uuid,boolean,timestamptz)','execute')
  or has_function_privilege('authenticated','private.hr_profile_scope_allows(uuid,uuid,uuid,uuid)','execute')
  or has_function_privilege('anon','private.hr_scope_allows(uuid,uuid,uuid)','execute') then raise exception 'HR RPC exposed'; end if;
 if has_table_privilege('authenticated','public.hr_sites','insert') or has_table_privilege('authenticated','public.hr_scopes','update') then raise exception 'direct HR referential writes'; end if;

 site_a := public.hr_save_site(hr,null,a,' Tour Zital ','zital',true,null);
 site_a2 := public.hr_save_site(hr,null,a,'Analakely','ANA',true,null);
 site_b := public.hr_save_site(super,null,b,'Ivandry','IVA',true,null);
 dept_a := public.hr_save_department(hr,null,a,'Service client',true,null);
 dept_b := public.hr_save_department(hr,null,b,'Support',true,null);
 team := public.hr_save_team(hr,null,site_a,'Equipe A',true,null);
 if (select code from public.hr_sites where id=site_a) <> 'ZITAL' or (select name from public.hr_sites where id=site_a) <> 'Tour Zital' then raise exception 'site not normalized'; end if;
 if not exists(select 1 from public.audit_logs where resource_id=site_a and action='hr_site.created' and actor_profile_id=hr) then raise exception 'site audit missing'; end if;
 if (select agency_id from public.hr_teams where id=team) <> a then raise exception 'team agency not derived from site'; end if;

 begin perform public.hr_save_site(payroll,null,a,'Forbidden','NOPE',true,null); raise exception 'agency manager saved site'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_save_site(hr,site_a,a,'Stale','ZITAL',true,99); raise exception 'stale site accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.hr_save_site(hr,null,a,'Duplicate','ZITAL',true,null); raise exception 'duplicate code accepted'; exception when unique_violation then null; end;
 begin perform public.hr_save_team(hr,team,site_b,'Moved',true,1); raise exception 'team moved to another agency'; exception when sqlstate '22023' then null; end;
 perform public.hr_save_site(hr,site_a,a,'Tour Zital','ZITAL',true,1);
 if (select revision from public.hr_sites where id=site_a) <> 2 then raise exception 'revision not incremented'; end if;
 begin perform public.hr_save_site(hr,null,a,'Rollback','ROLLBACK',true,null); raise exception 'audit failure accepted';
 exception when others then if sqlerrm <> 'test audit unavailable' then raise; end if; end;
 if exists(select 1 from public.hr_sites where code='ROLLBACK') then raise exception 'site kept without audit'; end if;

 begin perform public.admin_save_hr_access(hr,null,'c2000000-0000-4000-8000-000000000001','m@example.test','M','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept_a)),null);
  raise exception 'HR administered accounts'; exception when sqlstate '42501' then null; end;
 begin perform public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000002','c@example.test','C','client_viewer',true,jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept_a)),null);
  raise exception 'client without site accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000001','m@example.test','M','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept_a),jsonb_build_object('agency_id',b,'department_id',dept_b)),null);
  raise exception 'cross-agency scope accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000001','m@example.test','M','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site_b)),null);
  raise exception 'site of another agency accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000001','m@example.test','M','super_admin',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site_a)),null);
  raise exception 'privileged role granted'; exception when sqlstate '22023' then null; end;

 manager := public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000001','HR-Test-Manager@example.test','Manager RH','team_manager',true,
  jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept_a,'site_id',site_a)),null);
 client := public.admin_save_hr_access(super,null,'c2000000-0000-4000-8000-000000000002','hr-test-client@example.test','Client','client_viewer',true,
  jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site_a2)),null);
 if (select email from public.profiles where id=manager) <> 'hr-test-manager@example.test' then raise exception 'email not normalized'; end if;
 if (select count(*) from public.audit_logs where resource_id in (manager,client) and action='hr_access.created') <> 2 then raise exception 'access audit missing'; end if;
 if not private.hr_profile_scope_allows(manager,a,dept_a,site_a) or private.hr_profile_scope_allows(manager,a,dept_a,site_a2)
  or private.hr_profile_scope_allows(manager,a,null,site_a) or private.hr_profile_scope_allows(manager,b,dept_a,site_a) then raise exception 'manager intersection wrong'; end if;
 if not private.hr_profile_scope_allows(client,a,null,site_a2) or private.hr_profile_scope_allows(client,a,dept_a,site_a) then raise exception 'client site scope wrong'; end if;
 if not private.hr_profile_scope_allows(hr,b,null,null) or private.hr_profile_scope_allows(payroll,a,dept_a,site_a) then raise exception 'role scope wrong'; end if;
 stamp := (select updated_at from public.profiles where id=client);
 begin perform public.admin_set_hr_access_active(super,client,false,stamp - interval '1 second'); raise exception 'stale revocation accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.admin_set_hr_access_active(super,super,false,(select updated_at from public.profiles where id=super)); raise exception 'self revocation accepted'; exception when sqlstate '42501' then null; end;
end $$;

-- Live RLS as the team manager: own agency referential only, no payroll or personal data.
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.hr_sites where agency_id='c1000000-0000-4000-8000-000000000002') <> 0 then raise exception 'manager sees other agency sites'; end if;
 if (select count(*) from public.hr_sites where agency_id='c1000000-0000-4000-8000-000000000001') <> 2 then raise exception 'manager cannot read own agency sites'; end if;
 if (select count(*) from public.hr_scopes) <> 1 then raise exception 'manager sees other scopes'; end if;
 if (select count(*) from public.agencies) <> 1 then raise exception 'manager agency visibility wrong'; end if;
 if exists(select 1 from public.employees) or exists(select 1 from public.payslips) or exists(select 1 from public.audit_logs) then raise exception 'manager reads payroll or audit'; end if;
 if not private.hr_scope_allows('c1000000-0000-4000-8000-000000000001',(select id from public.hr_departments where name='Service client'),(select id from public.hr_sites where code='ZITAL')) then raise exception 'manager live scope missing'; end if;
end $$;
reset role;

-- Live RLS as the client viewer: only the assigned site.
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(code) from public.hr_sites) <> array['ANA'] then raise exception 'client sees other sites'; end if;
 if exists(select 1 from public.hr_teams) then raise exception 'client sees teams of another site'; end if;
end $$;
reset role;

-- Deactivating the site or revoking the account takes effect on the open session.
do $$ declare client uuid := (select id from public.profiles where email='hr-test-client@example.test'); begin
 perform public.hr_save_site('c3000000-0000-4000-8000-000000000001',(select id from public.hr_sites where code='ANA'),'c1000000-0000-4000-8000-000000000001','Analakely','ANA',false,1);
 if private.hr_profile_scope_allows(client,'c1000000-0000-4000-8000-000000000001',null,(select id from public.hr_sites where code='ANA')) then raise exception 'inactive site still in scope'; end if;
end $$;
do $$ declare manager uuid := (select id from public.profiles where email='hr-test-manager@example.test'); begin
 perform public.admin_set_hr_access_active('c3000000-0000-4000-8000-000000000002',manager,false,(select updated_at from public.profiles where id=manager));
 if not exists(select 1 from public.audit_logs where resource_id=manager and action='hr_access.revoked') then raise exception 'revocation audit missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if private.current_profile_id() is not null or exists(select 1 from public.hr_sites) or exists(select 1 from public.hr_scopes) then raise exception 'revoked manager keeps access'; end if;
end $$;
reset role;

-- Updating scopes replaces them atomically and requires the current revision.
do $$ declare manager uuid := (select id from public.profiles where email='hr-test-manager@example.test'); stamp timestamptz; begin
 stamp := (select updated_at from public.profiles where id=manager);
 perform public.admin_save_hr_access('c3000000-0000-4000-8000-000000000002',manager,null,null,'Manager RH','team_manager',true,
  jsonb_build_array(jsonb_build_object('agency_id','c1000000-0000-4000-8000-000000000001','site_id',(select id from public.hr_sites where code='ZITAL'))),stamp);
 if (select count(*) from public.hr_scopes where profile_id=manager) <> 1 or exists(select 1 from public.hr_scopes where profile_id=manager and department_id is not null) then raise exception 'scopes not replaced'; end if;
 begin perform public.admin_save_hr_access('c3000000-0000-4000-8000-000000000002',manager,null,null,'Manager RH','team_manager',false,
  jsonb_build_array(jsonb_build_object('agency_id','c1000000-0000-4000-8000-000000000001','site_id',(select id from public.hr_sites where code='ZITAL'))),stamp);
  raise exception 'stale scope update accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
rollback;
