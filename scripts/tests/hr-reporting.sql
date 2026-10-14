\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: role-scoped indicators, leave export, contract alerts and subscriptions.
insert into public.agencies(id,name,code) values
('a9000000-0000-4000-8000-000000000001','Reporting A','REPORTING-A-TEST'),
('a9000000-0000-4000-8000-000000000002','Reporting B','REPORTING-B-TEST');
insert into auth.users(id,email) values
('a9100000-0000-4000-8000-000000000001','rep-manager@example.test'),
('a9100000-0000-4000-8000-000000000002','rep-client@example.test'),
('a9100000-0000-4000-8000-000000000003','rep-hr@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('a9200000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000003','rep-hr@example.test','RH','hr_central'),
('a9200000-0000-4000-8000-000000000002',null,'rep-super@example.test','Super','super_admin'),
('a9200000-0000-4000-8000-000000000003',null,'rep-payroll@example.test','Payroll','agency_manager');
insert into public.employees(id,agency_id,employee_id,email,full_name) values
('a9300000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','RP-1','rep1@example.test','Un'),
('a9300000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000001','RP-2','rep2@example.test','Deux'),
('a9300000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000001','RP-3','rep3@example.test','Trois'),
('a9300000-0000-4000-8000-000000000004','a9000000-0000-4000-8000-000000000001','RP-4','rep4@example.test','Quatre'),
('a9300000-0000-4000-8000-000000000005','a9000000-0000-4000-8000-000000000001','RP-5','rep5@example.test','Sans dossier');

create temp table ids(name text primary key, id uuid);
grant all on ids to authenticated;
do $$
declare
 hr constant uuid := 'a9200000-0000-4000-8000-000000000001';
 super constant uuid := 'a9200000-0000-4000-8000-000000000002';
 a constant uuid := 'a9000000-0000-4000-8000-000000000001';
 s1 uuid; s2 uuid; dept uuid; manager uuid; client uuid; leave uuid;
begin
 s1 := public.hr_save_site(hr,null,a,'Nord','NORD',true,null);
 s2 := public.hr_save_site(hr,null,a,'Sud','SUD',true,null);
 dept := public.hr_save_department(hr,null,a,'Service',true,null);
 manager := public.admin_save_hr_access(super,null,'a9100000-0000-4000-8000-000000000001','rep-manager@example.test','Manager','team_manager',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',s1)),null);
 client := public.admin_save_hr_access(super,null,'a9100000-0000-4000-8000-000000000002','rep-client@example.test','Client','client_viewer',true,jsonb_build_array(jsonb_build_object('agency_id',a,'site_id',s2)),null);
 perform public.hr_save_employee_record(hr,'a9300000-0000-4000-8000-000000000001','Agent',dept,s1,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 perform public.hr_save_employee_record(hr,'a9300000-0000-4000-8000-000000000002','Agent',dept,s1,null,null,'ACTIVE','CDD','2026-10-01','2026-10-24',null);
 perform public.hr_save_employee_record(hr,'a9300000-0000-4000-8000-000000000003','Agent',dept,s2,null,null,'ACTIVE','CDI','2026-01-01',null,null);
 perform public.hr_save_employee_record(hr,'a9300000-0000-4000-8000-000000000004','Agent',dept,s2,null,null,'ACTIVE','MISSION','2026-01-01','2026-11-23',null);
 perform public.hr_save_assignment(hr,null,'a9300000-0000-4000-8000-000000000001',s1,null,'2026-10-01',null,'ACTIVE',null);
 leave := public.hr_create_leave(hr,'a9300000-0000-4000-8000-000000000003','AUTHORIZED_ABSENCE','2026-10-05','2026-10-07','Formation');
 perform public.hr_decide_leave(hr,leave,true,null,1,false);
 insert into ids values('s1',s1),('s2',s2),('manager',manager),('client',client);
end $$;

do $$
declare hr_view jsonb; manager_view jsonb; client_view jsonb; m uuid := (select id from ids where name='manager'); c uuid := (select id from ids where name='client');
begin
 hr_view := public.hr_dashboard_for_profile('a9200000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','2026-10-01','2026-10-14');
 if (hr_view->'totals'->>'headcount')::int <> 4 or (hr_view->'totals'->>'assigned')::int <> 1 or (hr_view->'totals'->>'absence_days')::int <> 3
  or (hr_view->'totals'->>'contracts_ending_30')::int <> 1 or (hr_view->'totals'->>'contracts_ending_60')::int <> 2 or (hr_view->'totals'->>'entries')::int <> 1
  or (hr_view->'hr'->>'missing_files')::int <> 1 or (hr_view->'period'->>'business_days')::int <> 22 then raise exception 'HR indicators wrong: %', hr_view->'totals'; end if;
 if jsonb_array_length(hr_view->'expiring') <> 2 or (hr_view->'expiring'->0->>'days_left')::int <> 10 then raise exception 'expiring list wrong'; end if;

 manager_view := public.hr_dashboard_for_profile(m,null,'2026-10-01','2026-10-14');
 if (manager_view->'totals'->>'headcount')::int <> 2 or jsonb_array_length(manager_view->'sites') <> 1 or manager_view->'sites'->0->>'site_name' <> 'Nord'
  or (manager_view->'totals'->>'absence_days')::int <> 0 or manager_view->'hr' <> 'null'::jsonb then raise exception 'manager indicators wrong: %', manager_view; end if;

 client_view := public.hr_dashboard_for_profile(c,null,'2026-10-01','2026-10-14');
 if (client_view->'totals'->>'headcount')::int <> 2 or client_view->'sites'->0->>'site_name' <> 'Sud' or jsonb_array_length(client_view->'sites') <> 1
  or client_view->'totals'->'absence_days' <> 'null'::jsonb or client_view->'totals'->'pending_leaves' <> 'null'::jsonb
  or client_view->'sites'->0->'absence_days' <> 'null'::jsonb or client_view->'hr' <> 'null'::jsonb then raise exception 'client indicators wrong: %', client_view; end if;

 if public.hr_dashboard_for_profile('a9200000-0000-4000-8000-000000000003',null,'2026-10-01','2026-10-14') is not null then raise exception 'payroll manager got indicators'; end if;
 if has_function_privilege('authenticated','public.hr_dashboard_for_profile(uuid,uuid,date,date)','execute')
  or has_function_privilege('authenticated','public.hr_contract_alerts_due(date)','execute')
  or has_function_privilege('authenticated','public.admin_set_report_subscription(uuid,uuid,public.hr_report_kind,uuid,boolean)','execute') then raise exception 'reporting internals exposed'; end if;
end $$;

-- Leave export: HR session only.
select set_config('request.jwt.claims','{"sub":"a9100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select days_in_period from public.hr_export_approved_leaves('a9000000-0000-4000-8000-000000000001','2026-10-06','2026-10-31')) <> 2 then raise exception 'export days wrong'; end if;
 if public.hr_dashboard() is null or public.hr_dashboard()->'hr' = 'null'::jsonb then raise exception 'live HR dashboard missing HR block'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.hr_export_approved_leaves(null,'2026-10-01','2026-10-31')) then raise exception 'client exported leaves'; end if;
 if public.hr_dashboard()->'hr' <> 'null'::jsonb then raise exception 'client live dashboard leaks HR block'; end if;
end $$;
reset role;

-- Subscriptions and alert thresholds with delivery deduplication.
do $$
declare super constant uuid := 'a9200000-0000-4000-8000-000000000002'; hr constant uuid := 'a9200000-0000-4000-8000-000000000001';
 a constant uuid := 'a9000000-0000-4000-8000-000000000001'; b constant uuid := 'a9000000-0000-4000-8000-000000000002';
 c uuid := (select id from ids where name='client'); due record;
begin
 begin perform public.admin_set_report_subscription(hr,hr,'CONTRACT_ALERTS',a,true); raise exception 'HR configured recipients'; exception when sqlstate '42501' then null; end;
 begin perform public.admin_set_report_subscription(super,c,'CONTRACT_ALERTS',a,true); raise exception 'client subscribed to contract alerts'; exception when sqlstate '22023' then null; end;
 begin perform public.admin_set_report_subscription(super,c,'MONTHLY_REPORT',b,true); raise exception 'client subscribed outside its agency'; exception when sqlstate '22023' then null; end;
 perform public.admin_set_report_subscription(super,c,'MONTHLY_REPORT',a,true);
 perform public.admin_set_report_subscription(super,hr,'CONTRACT_ALERTS',a,true);
 if (select count(*) from public.hr_contract_alerts_due('2026-10-14')) <> 1 then raise exception 'alerts due wrong'; end if;
 select * into due from public.hr_contract_alerts_due('2026-10-14');
 if due.threshold <> 15 or due.matricule <> 'RP-2' then raise exception 'threshold wrong: %', due.threshold; end if;
 insert into public.hr_notification_deliveries(kind, dedupe_key, recipient_profile_id) values('CONTRACT_ALERTS', due.dedupe_key, due.recipient_profile_id);
 if exists(select 1 from public.hr_contract_alerts_due('2026-10-15')) then raise exception 'alert repeated within threshold'; end if;
 if (select threshold from public.hr_contract_alerts_due('2026-10-19')) <> 7 then raise exception 'seven-day alert missing'; end if;
 begin insert into public.hr_notification_deliveries(kind, dedupe_key, recipient_profile_id) values('CONTRACT_ALERTS', due.dedupe_key, due.recipient_profile_id);
  raise exception 'duplicate delivery stored'; exception when unique_violation then null; end;
 perform public.admin_set_report_subscription(super,hr,'CONTRACT_ALERTS',a,false);
 if exists(select 1 from public.hr_contract_alerts_due('2026-10-19')) then raise exception 'unsubscribed recipient still alerted'; end if;
end $$;
rollback;
