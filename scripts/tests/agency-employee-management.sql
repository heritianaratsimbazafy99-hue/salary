\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
-- Transactional tests: no production data, fixtures are always rolled back.
insert into public.agencies(id,name,code) values
 ('a9100000-0000-4000-8000-000000000001','Agency lifecycle A','LIFECYCLE-A-TEST'),
 ('a9100000-0000-4000-8000-000000000002','Agency lifecycle B','LIFECYCLE-B-TEST');
insert into auth.users(id,email) values
 ('a9200000-0000-4000-8000-000000000001','lifecycle-manager@example.test'),
 ('a9200000-0000-4000-8000-000000000002','lifecycle-other@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
 ('a9300000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','lifecycle-manager@example.test','Manager A','agency_manager'),
 ('a9300000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000002','lifecycle-other@example.test','Manager B','agency_manager'),
 ('a9300000-0000-4000-8000-000000000003',null,'lifecycle-hr@example.test','Lifecycle HR','hr_central');
insert into public.agency_memberships(profile_id,agency_id) values
 ('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001'),
 ('a9300000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000002');

create function pg_temp.reject_lifecycle_audit() returns trigger language plpgsql as $$
begin
 if new.action='employee.created' and exists(select 1 from public.employees where id=new.employee_id and employee_id='AUDIT-ROLLBACK') then raise exception 'audit unavailable'; end if;
 return new;
end $$;
create trigger reject_lifecycle_audit before insert on public.agency_employee_events for each row execute function pg_temp.reject_lifecycle_audit();

do $$
declare a constant uuid:='a9100000-0000-4000-8000-000000000001'; b constant uuid:='a9100000-0000-4000-8000-000000000002';
 m constant uuid:='a9300000-0000-4000-8000-000000000001'; other_m constant uuid:='a9300000-0000-4000-8000-000000000002'; hr constant uuid:='a9300000-0000-4000-8000-000000000003';
 eid uuid; qid uuid; dep uuid; site uuid; req public.agency_employee_change_requests; rev integer;
begin
 if has_function_privilege('authenticated','public.agency_create_employee(uuid,uuid,text,text,text)','execute')
 or has_function_privilege('anon','public.agency_employee_directory(uuid,text,text,uuid,integer,integer)','execute')
 or has_table_privilege('authenticated','public.employee_agency_operations','select')
 or has_table_privilege('authenticated','public.agency_employee_change_requests','insert')
 or has_function_privilege('authenticated','private.agency_employee_event(uuid,uuid,text,text)','execute') then raise exception 'lifecycle grants exposed'; end if;
 begin perform public.agency_create_employee(m,a,'PROFILE-COLLISION','lifecycle-other@example.test','Existing account'); raise exception 'global profile collision accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.agency_create_employee(m,b,'X','x-life@example.test','X'); raise exception 'cross-agency creation permitted'; exception when insufficient_privilege then null; end;
 begin perform public.agency_create_employee(m,a,'AUDIT-ROLLBACK','audit-life@example.test','Audit'); raise exception 'audit failure swallowed'; exception when raise_exception then if sqlerrm<>'audit unavailable' then raise; end if; end;
 if exists(select 1 from public.employees where agency_id=a and employee_id='AUDIT-ROLLBACK') then raise exception 'audit failure did not rollback employee'; end if;
 eid:=public.agency_create_employee(m,a,chr(160)||'life-001'||chr(160),'Life-Employee@Example.test','Life Employee');
 if not exists(select 1 from public.employees where id=eid and employee_id='LIFE-001' and email='life-employee@example.test' and revision=1) then raise exception 'canonical identity mismatch'; end if;
 if not exists(select 1 from public.employee_employment_lifecycle where employee_id=eid and state='CURRENT' and started_on is null)
 or not exists(select 1 from public.employee_agency_operations where employee_id=eid and job_title is null and revision=1)
 or exists(select 1 from public.employee_hr_records where employee_id=eid) then raise exception 'minimal creation fabricated HR data'; end if;
 begin perform public.agency_save_employee(other_m,eid,1,1,'Forged',null,null,null,null,'forged'); raise exception 'cross agency write permitted'; exception when insufficient_privilege then null; end;
 perform public.agency_save_employee(m,eid,1,1,'Corrected Employee','Agent',null,null,null,'Name corrected');
 if not exists(select 1 from public.employees where id=eid and full_name='Corrected Employee' and revision=2)
 or not exists(select 1 from public.employee_agency_operations where employee_id=eid and job_title='Agent' and revision=2) then raise exception 'partial edit failed'; end if;
 begin perform public.agency_save_employee(m,eid,1,1,'Lost update',null,null,null,null,'Stale'); raise exception 'stale edit accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.agency_save_employee(m,eid,2,2,'Corrected Employee','Agent',null,null,null,'No change');
 if (select count(*) from public.agency_employee_events where employee_id=eid and action='employee.updated')<>1 then raise exception 'no-op produced audit'; end if;
 if not exists(select 1 from public.agency_employee_events where employee_id=eid and action='employee.updated' and before_employee_revision=1 and employee_revision=2 and 'full_name'=any(changed_fields) and reason='Name corrected' and before_operational_revision=1 and operational_revision=2) then raise exception 'correction audit incomplete'; end if;
 update public.employees set is_active=false where id=eid;
 if (select revision from public.employees where id=eid)<>3 then raise exception 'admin access bypassed revision'; end if;
 update public.employees set is_active=true where id=eid;
 begin perform public.agency_depart_employee(m,eid,4,1,(now() at time zone 'Indian/Antananarivo')::date+1,'Future'); raise exception 'future departure accepted'; exception when invalid_parameter_value then null; end;
 perform public.agency_depart_employee(m,eid,4,1,(now() at time zone 'Indian/Antananarivo')::date,'End assignment');
 if not exists(select 1 from public.employee_employment_lifecycle where employee_id=eid and state='DEPARTED' and revision=2)
 or not (select is_active from public.employees where id=eid) then raise exception 'departure changed access or lifecycle incorrect'; end if;
 qid:=public.agency_request_employee_change(m,eid,4,2,'RETURN',(now() at time zone 'Indian/Antananarivo')::date::text,'New mission');
 begin perform public.hr_decide_employee_change(m,qid,1,true,'Approved'); raise exception 'manager decided RH request'; exception when insufficient_privilege then null; end;
 perform public.hr_decide_employee_change(hr,qid,1,true,'Return approved');
 if not exists(select 1 from public.agency_employee_events where employee_id=eid and action='employee.return_decided' and before_lifecycle_revision=2 and lifecycle_revision=3 and result='APPROVED') then raise exception 'RH return audit incomplete'; end if;
 if not exists(select 1 from public.employee_employment_lifecycle where employee_id=eid and state='CURRENT' and revision=3)
 or (select count(*) from public.employee_employment_episodes where employee_id=eid)<>3 then raise exception 'return lost employment history'; end if;
 qid:=public.agency_request_employee_change(m,eid,4,3,'EMAIL','new-life@example.test','Email correction');
 perform public.hr_decide_employee_change(hr,qid,1,true,'Proof required');
 if not exists(select 1 from public.agency_employee_change_requests where id=qid and status='APPROVED_PENDING_VERIFICATION')
 or (select email from public.employees where id=eid)<>'life-employee@example.test' then raise exception 'email executed before verified Auth'; end if;
 dep:=public.hr_save_department(hr,null,a,'Lifecycle Department',true,null);
 site:=public.hr_save_site(hr,null,a,'Lifecycle Site','LC-SITE',true,null);
 perform public.hr_save_employee_record(hr,eid,'Complete Agent',dep,site,null,null,'ACTIVE','CDI',(now() at time zone 'Indian/Antananarivo')::date-30,null,null);
 if not exists(select 1 from public.employee_agency_operations where employee_id=eid and job_title='Complete Agent' and department_id=dep and site_id=site) then raise exception 'HR source did not sync'; end if;
 select revision into rev from public.employee_agency_operations where employee_id=eid;
 begin perform public.agency_save_employee(m,eid,4,rev,'Corrected Employee',null,null,null,null,'Clear complete'); raise exception 'complete record null cleared'; exception when invalid_parameter_value then null; end;
 -- Departure cannot silently resolve a planned assignment; resolution remains HR.
 insert into public.hr_assignments(agency_id,employee_id,site_id,start_date,status,created_by) values(a,eid,site,(now() at time zone 'Indian/Antananarivo')::date,'ACTIVE',hr);
 begin perform public.agency_depart_employee(m,eid,4,3,(now() at time zone 'Indian/Antananarivo')::date,'Conflict'); raise exception 'planning conflict ignored'; exception when sqlstate 'PT409' then null; end;
 update public.hr_assignments set status='ENDED',end_date=(now() at time zone 'Indian/Antananarivo')::date where employee_id=eid;
 perform public.agency_depart_employee(m,eid,4,3,(now() at time zone 'Indian/Antananarivo')::date,'Resolved');
 begin insert into public.hr_assignments(agency_id,employee_id,site_id,start_date,status,created_by) values(a,eid,site,(now() at time zone 'Indian/Antananarivo')::date+1,'PLANNED',hr); raise exception 'departed employee assigned'; exception when sqlstate 'PT409' then null; end;
 -- Audit boundary: expiration deletes only extension events, never employee/episodes.
 update public.agency_employee_events set expires_at=now() where employee_id=eid;
 perform private.purge_agency_employee_events(now());
 if exists(select 1 from public.agency_employee_events where employee_id=eid)
 or not exists(select 1 from public.employees where id=eid)
 or (select count(*) from public.employee_employment_episodes where employee_id=eid)<>4 then raise exception 'retention scope incorrect'; end if;
 perform set_config('test.lifecycle_employee_id',eid::text,true);
end $$;

-- Session reads use the real authenticated role / JWT subject, with live scope.
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare rows jsonb;
begin
 rows:=public.agency_employee_directory(null,null,null,current_setting('test.lifecycle_employee_id')::uuid);
 if jsonb_array_length(rows)<>1 or rows->0->>'state'<>'DEPARTED' or rows->0?'cnaps_number' or rows->0?'personal_email' then raise exception 'detail projection wrong'; end if;
 if public.agency_employee_directory('a9100000-0000-4000-8000-000000000002')<>'[]'::jsonb then raise exception 'cross-agency directory leaked'; end if;
 if jsonb_array_length(public.agency_employee_requests(current_setting('test.lifecycle_employee_id')::uuid))<>2 then raise exception 'request history unavailable'; end if;
 begin perform public.agency_create_employee('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','FORGED','forged@example.test','Forged'); raise exception 'authenticated mutation allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- More than 500 closed requests must never hide an older actionable request.
insert into public.agency_employee_change_requests(employee_id,agency_id,kind,requested_value,reason,status,revision,employee_revision,lifecycle_revision,created_by,created_at,decided_by,decided_at,decision_reason)
select current_setting('test.lifecycle_employee_id')::uuid,'a9100000-0000-4000-8000-000000000001','MATRICULE','CLOSED-'||n,'Pagination fixture','REJECTED',2,4,4,'a9300000-0000-4000-8000-000000000001',now()-interval '1 day'+n*interval '1 second','a9300000-0000-4000-8000-000000000003',now(),'Fixture rejected' from generate_series(1,501) n;
insert into public.agency_employee_change_requests(employee_id,agency_id,kind,requested_value,reason,employee_revision,lifecycle_revision,created_by,created_at)
values(current_setting('test.lifecycle_employee_id')::uuid,'a9100000-0000-4000-8000-000000000001','MANAGER','','Old pending visible',4,4,'a9300000-0000-4000-8000-000000000001',now()-interval '90 days');
set local role authenticated;
do $$ declare rows jsonb; begin
 rows:=public.agency_employee_requests(current_setting('test.lifecycle_employee_id')::uuid);
 if jsonb_array_length(rows)<>502 then raise exception 'request terminal cap or active inclusion incorrect'; end if;
 if not exists(select 1 from jsonb_array_elements(rows) x where x->>'reason'='Old pending visible' and x->>'status'='PENDING') then raise exception 'old pending request hidden by closed history'; end if;
 if not exists(select 1 from jsonb_array_elements(rows) x where x->>'status'='APPROVED_PENDING_VERIFICATION') then raise exception 'approved verification request hidden by closed history'; end if;
 if (select count(*) from jsonb_array_elements(rows) x where x->>'status' not in ('PENDING','APPROVED_PENDING_VERIFICATION'))<>500 then raise exception 'terminal history not capped at 500'; end if;
end $$;
reset role;
-- Exercise granted invoker mutations through the actual PostgREST service role.
set local role service_role;
do $$ declare eid uuid; begin
 eid:=public.agency_create_employee('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','SERVICE-PATH','lifecycle-service@example.test','Service path');
 if not exists(select 1 from public.employee_employment_lifecycle where employee_id=eid and state='CURRENT') then raise exception 'service role creation incomplete'; end if;
 begin perform public.agency_create_employee('a9300000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000001','FORGED-SCOPE','forged-scope@example.test','Forged scope'); raise exception 'forged service actor scope accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set is_active=false where id='a9300000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if public.agency_employee_directory()<>'[]'::jsonb then raise exception 'old JWT survived live deactivation'; end if; end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.agency_employee_directory(); raise exception 'anonymous directory permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
