\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: HR files, private details, CNAPS follow-up and scoped directory.
insert into public.agencies(id,name,code) values
('d1000000-0000-4000-8000-000000000001','Records A','REC-A-TEST'),
('d1000000-0000-4000-8000-000000000002','Records B','REC-B-TEST');
insert into auth.users(id,email) values
('d2000000-0000-4000-8000-000000000001','rec-manager@example.test'),
('d2000000-0000-4000-8000-000000000002','rec-client@example.test'),
('d2000000-0000-4000-8000-000000000003','rec-employee@example.test'),
('d2000000-0000-4000-8000-000000000004','rec-payroll@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('d3000000-0000-4000-8000-000000000001',null,'rec-hr@example.test','RH','hr_central'),
('d3000000-0000-4000-8000-000000000002',null,'rec-super@example.test','Super','super_admin'),
('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000004','rec-payroll@example.test','Payroll','agency_manager'),
('d3000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000003','rec-employee@example.test','Employee','employee');
insert into public.agency_memberships(profile_id,agency_id) values('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001');
create function pg_temp.reject_record_audit() returns trigger language plpgsql as $$
begin
 if new.action = 'hr_employee.created' and new.metadata->>'contract_type' = 'CDD' and exists(select 1 from public.employees where employee_id = 'ROLLBACK-1') then raise exception 'test audit unavailable'; end if;
 return new;
end $$;
create trigger test_reject_record_audit before insert on public.audit_logs for each row execute function pg_temp.reject_record_audit();

do $$
declare
 hr constant uuid := 'd3000000-0000-4000-8000-000000000001';
 super constant uuid := 'd3000000-0000-4000-8000-000000000002';
 payroll constant uuid := 'd3000000-0000-4000-8000-000000000003';
 a constant uuid := 'd1000000-0000-4000-8000-000000000001';
 b constant uuid := 'd1000000-0000-4000-8000-000000000002';
 site_a uuid; site_a2 uuid; site_b uuid; dept_a uuid; dept_a2 uuid; dept_b uuid; team_a uuid; team_a2 uuid; manager uuid; client uuid;
 e1 uuid; e2 uuid; e3 uuid; legacy uuid; mission uuid;
begin
 site_a := public.hr_save_site(hr,null,a,'Zital','ZITAL',true,null);
 site_a2 := public.hr_save_site(hr,null,a,'Analakely','ANA',true,null);
 site_b := public.hr_save_site(hr,null,b,'Ivandry','IVA',true,null);
 dept_a := public.hr_save_department(hr,null,a,'Service client',true,null);
 dept_a2 := public.hr_save_department(hr,null,a,'Back office',true,null);
 dept_b := public.hr_save_department(hr,null,b,'Support',true,null);
 team_a := public.hr_save_team(hr,null,site_a,'Matin',true,null);
 team_a2 := public.hr_save_team(hr,null,site_a2,'Soir',true,null);
 manager := public.admin_save_hr_access(super,null,'d2000000-0000-4000-8000-000000000001','rec-manager@example.test','Manager RH','team_manager',true,
  jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept_a,'site_id',site_a)),null);
 client := public.admin_save_hr_access(super,null,'d2000000-0000-4000-8000-000000000002','rec-client@example.test','Client','client_viewer',true,
  jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site_a2)),null);

 if has_function_privilege('authenticated','public.hr_create_employee(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,public.hr_employee_status,public.hr_contract_type,date,date)','execute')
  or has_function_privilege('authenticated','public.hr_save_private_details(uuid,uuid,text,text,text,text,integer)','execute')
  or has_function_privilege('authenticated','public.hr_update_cnaps(uuid,uuid,text,public.hr_cnaps_status,integer)','execute')
  or has_function_privilege('anon','public.hr_employee_directory(uuid,text,uuid,uuid,public.hr_employee_status,uuid,integer,integer)','execute')
  or has_table_privilege('authenticated','public.employee_private_details','update') then raise exception 'HR record writes exposed'; end if;

 e1 := public.hr_create_employee(hr,a,' MAT-001 ',' Rec-Employee@Example.test ','Employee One','Conseiller',dept_a,site_a,team_a,manager,'ACTIVE','CDI','2026-01-01',null);
 e2 := public.hr_create_employee(super,a,'MAT-002','rec-two@example.test','Employee Two','Superviseur',dept_a2,site_a2,team_a2,null,'ACTIVE','CDD','2026-01-01','2026-12-31');
 e3 := public.hr_create_employee(hr,b,'MAT-003','rec-three@example.test','Employee Three','Agent',dept_b,site_b,null,null,'ACTIVE','CDI','2026-01-01',null);
 update public.employees set profile_id='d3000000-0000-4000-8000-000000000004' where id=e1;
 if (select employee_id || '|' || email from public.employees where id=e1) <> 'MAT-001|rec-employee@example.test' then raise exception 'identity not normalized'; end if;
 if not exists(select 1 from public.employee_private_details where employee_id=e1 and cnaps_status='TO_DECLARE') then raise exception 'private row missing'; end if;
 if not exists(select 1 from public.audit_logs where resource_id=e1 and action='hr_employee.created' and employee_id=e1) then raise exception 'creation audit missing'; end if;

 begin perform public.hr_create_employee(payroll,a,'X','x@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'payroll manager created file';
 exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_employee(manager,a,'X','x@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'team manager created file';
 exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_employee(hr,a,'X','x@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','CDD','2026-01-01',null); raise exception 'CDD without end accepted';
 exception when sqlstate '22023' then null; end;
 -- Interim and mission contracts may have an imprecise term; their end can never precede the start.
 mission := public.hr_create_employee(hr,b,'MAT-MISSION','rec-mission@example.test','Mission','Agent',dept_b,site_b,null,null,'ACTIVE','MISSION','2026-03-01',null);
 if (select contract_type from public.employee_hr_records where employee_id = mission) <> 'MISSION' then raise exception 'open mission rejected'; end if;
 begin perform public.hr_create_employee(hr,a,'X','x@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','INTERIM','2026-03-01','2026-02-01'); raise exception 'interim ending before start accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_employee(hr,a,'X','x@example.test','X','Agent',dept_b,site_a,null,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'department of another agency accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_employee(hr,a,'X','x@example.test','X','Agent',dept_a,site_a,team_a2,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'team of another site accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_employee(hr,a,'X','x@example.test','X','Agent',dept_a,site_a,null,client,'ACTIVE','CDI','2026-01-01',null); raise exception 'client accepted as manager';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_employee(hr,a,'MAT-001','other@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'duplicate matricule accepted';
 exception when unique_violation then null; end;
 begin perform public.hr_create_employee(hr,a,'ROLLBACK-1','rollback@example.test','X','Agent',dept_a,site_a,null,null,'ACTIVE','CDD','2026-01-01','2026-02-01'); raise exception 'audit failure accepted';
 exception when others then if sqlerrm <> 'test audit unavailable' then raise; end if; end;
 if exists(select 1 from public.employees where employee_id='ROLLBACK-1') then raise exception 'employee kept without audit'; end if;

 -- A payroll import of the same matricule updates identity only; the HR file stays.
 insert into public.employees(agency_id,employee_id,email,full_name,is_active) values(a,'MAT-002','payroll-two@example.test','Employee Two (paie)',true)
 on conflict on constraint employees_agency_id_employee_id_key do update set email=excluded.email, full_name=excluded.full_name;
 if (select job_title from public.employee_hr_records where employee_id=e2) <> 'Superviseur' or (select email from public.employees where id=e2) <> 'payroll-two@example.test' then raise exception 'payroll and HR ownership mixed'; end if;

 -- Existing payroll employee without file: the file is created on the same row.
 insert into public.employees(agency_id,employee_id,email,full_name) values(a,'MAT-LEGACY','legacy@example.test','Legacy') returning id into legacy;
 begin perform public.hr_save_employee_record(hr,legacy,'Agent',dept_a,site_a,null,null,'ACTIVE','CDI','2026-01-01',null,1); raise exception 'missing file updated with a revision';
 exception when sqlstate 'PT409' then null; end;
 perform public.hr_save_employee_record(hr,legacy,'Agent',dept_a,site_a,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 if not exists(select 1 from public.employee_private_details where employee_id=legacy) then raise exception 'legacy private row missing'; end if;
 perform public.hr_save_employee_record(hr,e1,'Conseiller senior',dept_a,site_a,team_a,manager,'ON_LEAVE','CDI','2026-01-01',null,1);
 begin perform public.hr_save_employee_record(hr,e1,'Stale',dept_a,site_a,team_a,manager,'ACTIVE','CDI','2026-01-01',null,1); raise exception 'stale record accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select metadata->'changed' from public.audit_logs where employee_id=e1 and action='hr_employee_record.updated') <> '["status","job_title"]'::jsonb
  and (select metadata->'changed' from public.audit_logs where employee_id=e1 and action='hr_employee_record.updated') <> '["job_title","status"]'::jsonb then raise exception 'changed fields not audited'; end if;

 perform public.hr_save_private_details(hr,e1,' Perso@Example.test ','+261 34 00 000 00','Lot II A','Parent 034',1);
 if (select personal_email from public.employee_private_details where employee_id=e1) <> 'perso@example.test' then raise exception 'private email not normalized'; end if;
 if (select metadata::text from public.audit_logs where employee_id=e1 and action='hr_private_details.updated') ~ '(261|Lot II|perso@)' then raise exception 'private values written to audit'; end if;
 begin perform public.hr_save_private_details(hr,e1,null,null,null,null,1); raise exception 'stale private details accepted';
 exception when sqlstate 'PT409' then null; end;
 begin perform public.hr_update_cnaps(hr,e1,null,'DECLARED',2); raise exception 'declared without number';
 exception when sqlstate '22023' then null; end;
 perform public.hr_update_cnaps(hr,e1,'CN-123','DECLARED',2);
 if (select metadata::text from public.audit_logs where employee_id=e1 and action='hr_cnaps.updated') ~ 'CN-123' then raise exception 'CNAPS number written to audit'; end if;
 begin perform public.hr_update_cnaps(manager,e1,'CN-999','TO_REGULARIZE',3); raise exception 'manager updated CNAPS';
 exception when sqlstate '42501' then null; end;
end $$;

-- Team manager (Service client ∩ Zital): directory only, no private table, no email column.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(matricule order by matricule) from public.hr_employee_directory()) <> array['MAT-001','MAT-LEGACY'] then raise exception 'manager directory scope wrong'; end if;
 if (select manager_name from public.hr_employee_directory(p_search => 'mat-001')) <> 'Manager RH' then raise exception 'manager name or search missing'; end if;
 if exists(select 1 from public.employee_private_details) or exists(select 1 from public.employee_hr_records) or exists(select 1 from public.employees) then raise exception 'manager reads private or raw tables'; end if;
 if exists(select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'hr_employee_directory' and p.parameter_mode = 'OUT' and p.parameter_name ~ '(email|phone|cnaps|address|balance)') then raise exception 'directory exposes private columns'; end if;
 if (select count(*) from public.hr_employee_directory(p_search => '100%')) <> 0 then raise exception 'search wildcard not escaped'; end if;
end $$;
reset role;

-- Client viewer (Analakely only).
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(matricule) from public.hr_employee_directory()) <> array['MAT-002'] then raise exception 'client directory scope wrong'; end if;
 if exists(select 1 from public.employee_private_details) then raise exception 'client reads private details'; end if;
end $$;
reset role;

-- Employee: only self, own private details.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(matricule) from public.hr_employee_directory()) <> array['MAT-001'] then raise exception 'employee directory not limited to self'; end if;
 if (select array_agg(cnaps_number) from public.employee_private_details) <> array['CN-123'] then raise exception 'employee private details wrong'; end if;
 if exists(select 1 from public.employee_hr_records) then raise exception 'employee reads raw HR records'; end if;
end $$;
reset role;

-- Payroll agency manager: no HR data.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.hr_employee_directory()) or exists(select 1 from public.employee_private_details) then raise exception 'payroll manager reads HR data'; end if;
end $$;
reset role;

-- Revocation removes the manager directory on the open session.
do $$ declare m uuid := (select id from public.profiles where email='rec-manager@example.test'); begin
 perform public.admin_set_hr_access_active('d3000000-0000-4000-8000-000000000002',m,false,(select updated_at from public.profiles where id=m));
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin if exists(select 1 from public.hr_employee_directory()) then raise exception 'revoked manager keeps directory'; end if; end $$;
reset role;
rollback;
