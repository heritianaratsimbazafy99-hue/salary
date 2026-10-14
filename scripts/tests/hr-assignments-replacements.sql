\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: assignments, replacement needs and confirmations, scoped reads.
insert into public.agencies(id,name,code) values('a7000000-0000-4000-8000-000000000001','Planning A','PLANNING-A-TEST');
insert into auth.users(id,email) values
('a7100000-0000-4000-8000-000000000001','plan-manager@example.test'),
('a7100000-0000-4000-8000-000000000002','plan-client@example.test'),
('a7100000-0000-4000-8000-000000000003','plan-other-client@example.test'),
('a7100000-0000-4000-8000-000000000004','plan-absent@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('a7200000-0000-4000-8000-000000000001',null,'plan-hr@example.test','RH','hr_central'),
('a7200000-0000-4000-8000-000000000002',null,'plan-super@example.test','Super','super_admin'),
('a7200000-0000-4000-8000-000000000003','a7100000-0000-4000-8000-000000000004','plan-absent@example.test','Absent','employee');
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name) values
('a7300000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000003','PL-ABS','plan-absent@example.test','Absent'),
('a7300000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000001',null,'PL-REP','plan-rep@example.test','Remplacant'),
('a7300000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-000000000001',null,'PL-BUSY','plan-busy@example.test','Occupe'),
('a7300000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-000000000001',null,'PL-SHORT','plan-short@example.test','Contrat court');

do $$
declare
 hr constant uuid := 'a7200000-0000-4000-8000-000000000001';
 super constant uuid := 'a7200000-0000-4000-8000-000000000002';
 a constant uuid := 'a7000000-0000-4000-8000-000000000001';
 absent constant uuid := 'a7300000-0000-4000-8000-000000000001';
 rep constant uuid := 'a7300000-0000-4000-8000-000000000002';
 busy constant uuid := 'a7300000-0000-4000-8000-000000000003';
 short constant uuid := 'a7300000-0000-4000-8000-000000000004';
 site uuid; site2 uuid; dept uuid; team uuid; manager uuid; client uuid; other_client uuid; asg uuid; l1 uuid; l2 uuid; need uuid; need2 uuid;
begin
 if has_function_privilege('authenticated','public.hr_save_assignment(uuid,uuid,uuid,uuid,uuid,date,date,public.hr_assignment_status,integer)','execute')
  or has_function_privilege('authenticated','public.hr_confirm_replacement(uuid,uuid,uuid,integer)','execute')
  or has_table_privilege('authenticated','public.hr_assignments','select') or has_table_privilege('authenticated','public.hr_replacements','select') then raise exception 'planning internals exposed'; end if;
 site := public.hr_save_site(hr,null,a,'Zital','ZITAL',true,null);
 site2 := public.hr_save_site(hr,null,a,'Ivato','IVATO',true,null);
 dept := public.hr_save_department(hr,null,a,'Service',true,null);
 team := public.hr_save_team(hr,null,site,'Matin',true,null);
 manager := public.admin_save_hr_access(super,null,'a7100000-0000-4000-8000-000000000001','plan-manager@example.test','Manager','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept,'site_id',site)),null);
 client := public.admin_save_hr_access(super,null,'a7100000-0000-4000-8000-000000000002','plan-client@example.test','Client','client_viewer',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site)),null);
 other_client := public.admin_save_hr_access(super,null,'a7100000-0000-4000-8000-000000000003','plan-other-client@example.test','Autre client','client_viewer',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site2)),null);
 perform public.hr_save_employee_record(hr,absent,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 perform public.hr_save_employee_record(hr,rep,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 perform public.hr_save_employee_record(hr,busy,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 perform public.hr_save_employee_record(hr,short,'Agent',dept,site,null,null,'ACTIVE','CDD','2026-01-01','2026-11-03',null);
 perform public.hr_adjust_leave_balance(hr,absent,'INITIAL',20,'Solde de test',1);

 -- Assignments: scope, contract, overlap, revision.
 asg := public.hr_save_assignment(manager,null,absent,site,team,'2026-10-01',null,'ACTIVE',null);
 begin perform public.hr_save_assignment(manager,null,absent,site2,null,'2026-10-15','2026-10-20','ACTIVE',null); raise exception 'manager assigned outside its sites'; exception when sqlstate 'P0002' then null; end;
 begin perform public.hr_save_assignment(client,null,absent,site,null,'2026-12-01',null,'PLANNED',null); raise exception 'client assigned'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_save_assignment(hr,null,absent,site2,null,'2026-11-01','2026-11-30','PLANNED',null); raise exception 'overlapping assignment accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.hr_save_assignment(hr,null,short,site,null,'2026-10-01',null,'ACTIVE',null); raise exception 'open assignment beyond CDD'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_save_assignment(hr,null,rep,site2,team,'2026-10-01',null,'ACTIVE',null); raise exception 'team of another site'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_save_assignment(hr,null,rep,site,null,'2026-10-01',null,'ENDED',null); raise exception 'ended without end date'; exception when sqlstate '22023' then null; end;
 perform public.hr_save_assignment(hr,asg,absent,site,team,'2026-10-01','2026-12-31','ACTIVE',1);
 begin perform public.hr_save_assignment(hr,asg,absent,site,team,'2026-10-01',null,'ACTIVE',1); raise exception 'stale assignment accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.hr_save_assignment(hr,null,absent,site2,null,'2027-01-01',null,'PLANNED',null);
 -- An ENDED assignment no longer blocks the period.
 perform public.hr_save_assignment(hr,null,rep,site,null,'2026-09-01','2026-09-30','ENDED',null);
 perform public.hr_save_assignment(hr,null,rep,site,null,'2026-09-15',null,'ACTIVE',null);
 -- A contract change cannot strand an open assignment.
 begin perform public.hr_save_employee_record(hr,rep,'Agent',dept,site,null,null,'ACTIVE','CDD','2026-01-01','2026-10-31',1); raise exception 'contract shrink accepted';
 exception when sqlstate '22023' then if sqlerrm <> 'contract_conflict' then raise; end if; end;

 -- Replacement need created with the approval, atomically.
 l1 := public.hr_create_leave(hr,absent,'PAID_LEAVE','2026-11-02','2026-11-06','Vacances');
 begin perform public.hr_decide_leave(manager,l1,false,'Non',1,true); raise exception 'replacement on refusal'; exception when sqlstate '22023' then null; end;
 perform public.hr_decide_leave(manager,l1,true,null,1,true);
 select id into need from public.hr_replacements where leave_request_id=l1;
 if need is null or (select status from public.hr_replacements where id=need) <> 'OPEN' or (select site_id from public.hr_replacements where id=need) <> site then raise exception 'replacement need missing'; end if;

 -- Candidates and confirmation rules.
 perform public.hr_create_leave(hr,busy,'AUTHORIZED_ABSENCE','2026-11-04','2026-11-04','Rendez-vous');
 begin perform public.hr_confirm_replacement(manager,need,absent,1); raise exception 'absent replaces themselves'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_confirm_replacement(manager,need,busy,1); raise exception 'candidate on leave accepted'; exception when sqlstate '22023' then if sqlerrm <> 'candidate_absent' then raise; end if; end;
 begin perform public.hr_confirm_replacement(manager,need,short,1); raise exception 'candidate outside contract accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_confirm_replacement(client,need,rep,1); raise exception 'client confirmed'; exception when sqlstate '42501' then null; end;
 perform public.hr_confirm_replacement(manager,need,rep,1);
 if (select replacement_employee_id from public.hr_replacements where id=need) <> rep then raise exception 'replacement not confirmed'; end if;
 begin perform public.hr_confirm_replacement(hr,need,busy,2); raise exception 'double confirmation'; exception when sqlstate 'PT409' then null; end;

 -- The same replacement cannot be booked twice over overlapping days (exclusion).
 perform public.hr_save_employee_record(hr,busy,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,1);
 l2 := public.hr_create_leave(hr,busy,'AUTHORIZED_ABSENCE','2026-11-05','2026-11-05','Formation');
 perform public.hr_decide_leave(hr,l2,true,null,1,true);
 select id into need2 from public.hr_replacements where leave_request_id=l2;
 begin perform public.hr_confirm_replacement(hr,need2,rep,1); raise exception 'double booking accepted'; exception when sqlstate 'PT409' then if sqlerrm <> 'candidate_busy' then raise; end if; end;
 -- A booked replacement cannot take approved leave over the same days.
 begin perform public.hr_decide_leave(hr,public.hr_create_leave(hr,rep,'AUTHORIZED_ABSENCE','2026-11-03','2026-11-03','Perso'),true,null,1,false); raise exception 'replacement went on leave';
 exception when sqlstate '22023' then if sqlerrm <> 'busy_replacing' then raise; end if; end;

 -- Cancelling the leave closes its replacement and frees the colleague.
 perform public.hr_cancel_leave(hr,l1,'Congé reporté',2);
 if (select status from public.hr_replacements where id=need) <> 'CANCELLED' then raise exception 'replacement not cancelled with leave'; end if;
 perform public.hr_confirm_replacement(hr,need2,rep,1);
 perform public.hr_cancel_replacement(hr,need2,2);
 if not exists(select 1 from public.audit_logs where resource_id=need2 and action='hr_replacement.cancelled') then raise exception 'replacement audit missing'; end if;
end $$;

-- Client of Zital: assignments and replacements of its site only, no reasons or leave data.
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.hr_list_assignments() where site_name <> 'Zital') or not exists(select 1 from public.hr_list_assignments()) then raise exception 'client assignments scope wrong'; end if;
 if (select count(*) from public.hr_list_replacements()) <> 2 then raise exception 'client replacements wrong'; end if;
 if exists(select 1 from public.hr_list_leaves()) or exists(select 1 from public.hr_replacement_candidates((select id from public.hr_list_replacements() limit 1))) then raise exception 'client reads leaves or candidates'; end if;
 if exists(select 1 from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name
   where r.routine_name = 'hr_list_replacements' and p.parameter_mode = 'OUT' and p.parameter_name ~ '(reason|leave_type|days)') then raise exception 'replacement list exposes leave details'; end if;
end $$;
reset role;
-- Client of Ivato: only the planned Ivato assignment.
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(site_name) from public.hr_list_assignments()) <> array['Ivato'] or exists(select 1 from public.hr_list_replacements()) then raise exception 'other client scope wrong'; end if;
end $$;
reset role;
-- Absent employee: own assignments and replacements concerning them.
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.hr_list_assignments() where matricule <> 'PL-ABS') or (select count(*) from public.hr_list_replacements()) <> 1 then raise exception 'employee planning scope wrong'; end if;
end $$;
reset role;
rollback;
