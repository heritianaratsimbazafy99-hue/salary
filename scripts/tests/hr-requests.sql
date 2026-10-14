\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: HR requests lifecycle and owner/HR-only visibility.
insert into public.agencies(id,name,code) values('a8000000-0000-4000-8000-000000000001','Requests A','REQUESTS-A-TEST');
insert into auth.users(id,email) values
('a8100000-0000-4000-8000-000000000001','req-owner@example.test'),
('a8100000-0000-4000-8000-000000000002','req-other@example.test'),
('a8100000-0000-4000-8000-000000000003','req-manager@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('a8200000-0000-4000-8000-000000000001',null,'req-hr@example.test','RH','hr_central'),
('a8200000-0000-4000-8000-000000000002',null,'req-super@example.test','Super','super_admin'),
('a8200000-0000-4000-8000-000000000003','a8100000-0000-4000-8000-000000000001','req-owner@example.test','Owner','employee'),
('a8200000-0000-4000-8000-000000000004','a8100000-0000-4000-8000-000000000002','req-other@example.test','Other','employee');
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name) values
('a8300000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000003','RQ-1','req-owner@example.test','Owner'),
('a8300000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000004','RQ-2','req-other@example.test','Other');
do $$
declare
 hr constant uuid := 'a8200000-0000-4000-8000-000000000001';
 owner_profile constant uuid := 'a8200000-0000-4000-8000-000000000003';
 other_profile constant uuid := 'a8200000-0000-4000-8000-000000000004';
 a constant uuid := 'a8000000-0000-4000-8000-000000000001';
 owner constant uuid := 'a8300000-0000-4000-8000-000000000001';
 site uuid; dept uuid; manager uuid; r1 uuid;
begin
 if has_function_privilege('authenticated','public.hr_reply_request(uuid,uuid,text,public.hr_request_status,integer)','execute')
  or has_table_privilege('authenticated','public.hr_requests','insert') then raise exception 'request internals exposed'; end if;
 site := public.hr_save_site(hr,null,a,'Zital','ZITAL',true,null);
 dept := public.hr_save_department(hr,null,a,'Service',true,null);
 manager := public.admin_save_hr_access('a8200000-0000-4000-8000-000000000002',null,'a8100000-0000-4000-8000-000000000003','req-manager@example.test','Manager','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site)),null);
 perform public.hr_save_employee_record(hr,owner,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 begin perform public.hr_create_request(other_profile,owner,'PAYROLL','Bulletin','Question'); raise exception 'colleague opened a request'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_request(manager,owner,'PAYROLL','Bulletin','Question'); raise exception 'manager opened a request'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_request(owner_profile,owner,'PAYROLL','','Question'); raise exception 'empty subject'; exception when sqlstate '22023' then null; end;
 r1 := public.hr_create_request(owner_profile,owner,'PAYROLL','Attestation de salaire','Merci de me fournir une attestation pour ma banque.');
 perform public.hr_create_request(hr,'a8300000-0000-4000-8000-000000000002','CONTRACT','Avenant','Préparation avenant');
 if (select metadata::text from public.audit_logs where resource_id=r1) ~ 'banque|Attestation' then raise exception 'request text in audit'; end if;
 begin perform public.hr_reply_request(manager,r1,'Ok','IN_PROGRESS',1); raise exception 'manager replied'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_reply_request(hr,r1,'','IN_PROGRESS',1); raise exception 'empty reply'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_reply_request(hr,r1,'Ok','OPEN',1); raise exception 'reply back to open'; exception when sqlstate '22023' then null; end;
 perform public.hr_reply_request(hr,r1,'Attestation en préparation.','IN_PROGRESS',1);
 begin perform public.hr_reply_request(hr,r1,'Stale','RESOLVED',1); raise exception 'stale reply'; exception when sqlstate 'PT409' then null; end;
 perform public.hr_reply_request(hr,r1,'Attestation déposée dans vos documents.','RESOLVED',2);
 if (select status from public.hr_requests where id=r1) <> 'RESOLVED' then raise exception 'not resolved'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(subject) from public.hr_requests) <> array['Attestation de salaire'] then raise exception 'owner visibility wrong'; end if;
end $$;
reset role;
do $$ declare sub text; begin
 foreach sub in array array['a8100000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000003'] loop
  perform set_config('request.jwt.claims', jsonb_build_object('sub',sub,'role','authenticated')::text, true);
  set local role authenticated;
  if exists(select 1 from public.hr_requests where subject = 'Attestation de salaire') then raise exception 'request visible to %', sub; end if;
  if sub = 'a8100000-0000-4000-8000-000000000003' and exists(select 1 from public.hr_requests) then raise exception 'manager reads requests'; end if;
  reset role;
 end loop;
end $$;
rollback;
