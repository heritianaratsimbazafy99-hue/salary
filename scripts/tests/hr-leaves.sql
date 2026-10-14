\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: balances, requests, decisions, cancellations and role visibility.
insert into public.agencies(id,name,code) values('f1000000-0000-4000-8000-000000000001','Leaves A','LEAVES-A-TEST');
insert into auth.users(id,email) values
('f2000000-0000-4000-8000-000000000001','leave-owner@example.test'),
('f2000000-0000-4000-8000-000000000002','leave-other@example.test'),
('f2000000-0000-4000-8000-000000000003','leave-manager@example.test'),
('f2000000-0000-4000-8000-000000000004','leave-outsider@example.test'),
('f2000000-0000-4000-8000-000000000005','leave-client@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('f3000000-0000-4000-8000-000000000001',null,'leave-hr@example.test','RH','hr_central'),
('f3000000-0000-4000-8000-000000000002',null,'leave-super@example.test','Super','super_admin'),
('f3000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000001','leave-owner@example.test','Owner','employee'),
('f3000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-000000000002','leave-other@example.test','Other','employee');
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name) values
('f4000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003','LV-1','leave-owner@example.test','Owner'),
('f4000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000004','LV-2','leave-other@example.test','Other');
create function pg_temp.reject_leave_audit() returns trigger language plpgsql as $$
begin
 if new.action = 'hr_leave.approved' and (new.metadata->>'days')::int = 4 then raise exception 'test audit unavailable'; end if;
 return new;
end $$;
create trigger test_reject_leave_audit before insert on public.audit_logs for each row execute function pg_temp.reject_leave_audit();

do $$
declare
 hr constant uuid := 'f3000000-0000-4000-8000-000000000001';
 super constant uuid := 'f3000000-0000-4000-8000-000000000002';
 owner_profile constant uuid := 'f3000000-0000-4000-8000-000000000003';
 other_profile constant uuid := 'f3000000-0000-4000-8000-000000000004';
 a constant uuid := 'f1000000-0000-4000-8000-000000000001';
 owner constant uuid := 'f4000000-0000-4000-8000-000000000001';
 other constant uuid := 'f4000000-0000-4000-8000-000000000002';
 site uuid; site2 uuid; dept uuid; manager uuid; outsider uuid; client uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid;
begin
 if public.hr_business_days('2026-10-16','2026-10-19') <> 2 or public.hr_business_days('2026-10-17','2026-10-18') <> 0 then raise exception 'business days wrong'; end if;
 if has_function_privilege('authenticated','public.hr_decide_leave(uuid,uuid,boolean,text,integer,boolean)','execute')
  or has_function_privilege('authenticated','public.hr_adjust_leave_balance(uuid,uuid,public.hr_balance_movement_kind,integer,text,integer)','execute')
  or has_table_privilege('authenticated','public.leave_requests','select')
  or has_table_privilege('authenticated','public.leave_balances','update') then raise exception 'leave internals exposed'; end if;

 site := public.hr_save_site(hr,null,a,'Zital','ZITAL',true,null);
 site2 := public.hr_save_site(hr,null,a,'Ankorondrano','ANK',true,null);
 dept := public.hr_save_department(hr,null,a,'Service',true,null);
 manager := public.admin_save_hr_access(super,null,'f2000000-0000-4000-8000-000000000003','leave-manager@example.test','Manager','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site)),null);
 outsider := public.admin_save_hr_access(super,null,'f2000000-0000-4000-8000-000000000004','leave-outsider@example.test','Outsider','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site2)),null);
 client := public.admin_save_hr_access(super,null,'f2000000-0000-4000-8000-000000000005','leave-client@example.test','Client','client_viewer',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',site)),null);
 perform public.hr_save_employee_record(hr,owner,'Agent',dept,site,null,null,'ACTIVE','CDD','2026-01-01','2026-12-31',null);
 perform public.hr_save_employee_record(hr,other,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);

 -- Balances: initial value, motivated corrections, revision and floor at zero.
 if public.hr_adjust_leave_balance(hr,owner,'INITIAL',10,'Reprise du solde au 1er octobre',1) <> 10 then raise exception 'initial balance wrong'; end if;
 begin perform public.hr_adjust_leave_balance(hr,owner,'ADJUSTMENT',1,'Stale',1); raise exception 'stale balance accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.hr_adjust_leave_balance(hr,owner,'ADJUSTMENT',-11,'Trop',2); raise exception 'negative balance accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_adjust_leave_balance(hr,owner,'ADJUSTMENT',1,'',2); raise exception 'correction without reason'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_adjust_leave_balance(manager,owner,'ADJUSTMENT',1,'Manager',2); raise exception 'manager adjusted balance'; exception when sqlstate '42501' then null; end;
 begin update public.leave_balances set balance_days = -1 where employee_id = owner; raise exception 'negative balance stored'; exception when check_violation then null; end;

 -- Requests: self or HR only; contract, status, balance and overlap controls.
 begin perform public.hr_create_leave(other_profile,owner,'PAID_LEAVE','2026-11-02','2026-11-03','Vacances'); raise exception 'other employee filed a leave'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_leave(manager,owner,'PAID_LEAVE','2026-11-02','2026-11-03','Vacances'); raise exception 'manager filed a personal leave'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_leave(client,owner,'PAID_LEAVE','2026-11-02','2026-11-03','Vacances'); raise exception 'client filed a leave'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-12-28','2027-01-04','Fêtes'); raise exception 'leave beyond contract'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-10-17','2026-10-18','Week-end'); raise exception 'weekend-only leave'; exception when sqlstate '22023' then null; end;
 begin perform public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-11-02','2026-11-20','Trop long'); raise exception 'insufficient balance accepted'; exception when sqlstate '22023' then null; end;
 l1 := public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-11-02','2026-11-04','Vacances en famille');
 if (select days from public.leave_requests where id=l1) <> 3 then raise exception 'days not computed'; end if;
 begin perform public.hr_create_leave(hr,owner,'AUTHORIZED_ABSENCE','2026-11-04','2026-11-05','Rendez-vous'); raise exception 'overlap accepted'; exception when sqlstate 'PT409' then null; end;

 -- Decisions: scope, revision, single debit.
 begin perform public.hr_decide_leave(outsider,l1,true,null,1,false); raise exception 'out-of-scope manager decided'; exception when sqlstate 'P0002' then null; end;
 begin perform public.hr_decide_leave(client,l1,true,null,1,false); raise exception 'client decided'; exception when sqlstate '42501' then null; end;
 begin perform public.hr_decide_leave(manager,l1,false,'',1,false); raise exception 'refusal without reason'; exception when sqlstate '22023' then null; end;
 perform public.hr_decide_leave(manager,l1,true,'Bon repos',1,false);
 begin perform public.hr_decide_leave(hr,l1,true,null,1,false); raise exception 'second approval accepted'; exception when sqlstate 'PT409' then null; end;
 if (select balance_days from public.leave_balances where employee_id=owner) <> 7 or (select count(*) from public.leave_balance_movements where leave_request_id=l1) <> 1 then raise exception 'debit not applied once'; end if;
 begin insert into public.leave_balance_movements(agency_id,employee_id,kind,days,balance_after,leave_request_id,actor_profile_id) values(a,owner,'APPROVAL_DEBIT',-3,4,l1,hr);
  raise exception 'duplicate debit stored'; exception when unique_violation then null; end;

 -- A failure after the debit (audit) rolls back status, debit and balance together.
 l2 := public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-11-09','2026-11-12','Voyage');
 begin perform public.hr_decide_leave(hr,l2,true,null,1,false); raise exception 'audit failure accepted';
 exception when others then if sqlerrm <> 'test audit unavailable' then raise; end if; end;
 if (select status from public.leave_requests where id=l2) <> 'PENDING' or (select balance_days from public.leave_balances where employee_id=owner) <> 7
  or exists(select 1 from public.leave_balance_movements where leave_request_id=l2) then raise exception 'partial approval persisted'; end if;

 -- Refusal frees the period; cancellation credits back exactly once.
 perform public.hr_decide_leave(manager,l2,false,'Période chargée',1,false);
 l3 := public.hr_create_leave(owner_profile,owner,'AUTHORIZED_ABSENCE','2026-11-10','2026-11-10','Démarche administrative');
 begin perform public.hr_cancel_leave(owner_profile,l1,'Je ne pars plus',2); raise exception 'employee cancelled an approved leave'; exception when sqlstate '42501' then null; end;
 perform public.hr_cancel_leave(owner_profile,l3,'Rendez-vous annulé',1);
 perform public.hr_cancel_leave(hr,l1,'Départ annulé par le salarié',2);
 begin perform public.hr_cancel_leave(hr,l1,'Encore',3); raise exception 'double cancellation'; exception when sqlstate 'PT409' then null; end;
 if (select balance_days from public.leave_balances where employee_id=owner) <> 10
  or (select count(*) from public.leave_balance_movements where leave_request_id=l1 and kind='CANCELLATION_CREDIT') <> 1 then raise exception 'credit not applied once'; end if;

 -- Inactive employees and revoked managers cannot be the subject or author of a decision.
 l4 := public.hr_create_leave(hr,other,'AUTHORIZED_ABSENCE','2026-11-16','2026-11-16','Formation');
 perform public.hr_save_employee_record(hr,other,'Agent',dept,site,null,null,'INACTIVE','CDI','2026-01-01',null,1);
 begin perform public.hr_decide_leave(hr,l4,true,null,1,false); raise exception 'inactive employee approved'; exception when sqlstate '22023' then null; end;
 perform public.hr_save_employee_record(hr,other,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,2);
 l5 := public.hr_create_leave(owner_profile,owner,'PAID_LEAVE','2026-11-23','2026-11-23','Pont');
 perform public.admin_set_hr_access_active(super,manager,false,(select updated_at from public.profiles where id=manager));
 begin perform public.hr_decide_leave(manager,l5,true,null,1,false); raise exception 'revoked manager decided'; exception when sqlstate '42501' then null; end;
 perform public.admin_set_hr_access_active(super,manager,true,(select updated_at from public.profiles where id=manager));
 if not exists(select 1 from public.audit_logs where resource_id=l1 and action='hr_leave.cancelled' and (metadata->>'credited_days')::int = 3) then raise exception 'cancellation audit missing'; end if;
end $$;

-- Team manager: requests and balances of the scope, never the personal reasons.
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.hr_list_leaves()) <> 5 then raise exception 'manager leave scope wrong'; end if;
 if exists(select 1 from public.hr_list_leaves() where reason is not null or decision_reason is not null) then raise exception 'manager reads reasons'; end if;
 if (select count(*) from public.leave_balances) <> 1 or exists(select 1 from public.leave_balance_movements) then raise exception 'manager balance visibility wrong'; end if;
end $$;
reset role;
-- Out-of-scope manager and client: nothing.
do $$ declare sub text; begin
 foreach sub in array array['f2000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-000000000005'] loop
  perform set_config('request.jwt.claims', jsonb_build_object('sub',sub,'role','authenticated')::text, true);
  set local role authenticated;
  if exists(select 1 from public.hr_list_leaves()) or exists(select 1 from public.leave_balances) then raise exception 'leave data visible to %', sub; end if;
  reset role;
 end loop;
end $$;
-- Owner: own requests with reasons, own balance and history; the colleague sees only theirs.
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.hr_list_leaves()) <> 4 or not exists(select 1 from public.hr_list_leaves() where reason = 'Vacances en famille') then raise exception 'owner leaves wrong'; end if;
 if (select count(*) from public.leave_balance_movements) <> 3 then raise exception 'owner history wrong'; end if;
 begin perform 1 from public.leave_requests; raise exception 'direct leave read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.hr_list_leaves() where employee_id <> 'f4000000-0000-4000-8000-000000000002') or exists(select 1 from public.leave_balances) then raise exception 'colleague data visible'; end if;
end $$;
reset role;
rollback;
