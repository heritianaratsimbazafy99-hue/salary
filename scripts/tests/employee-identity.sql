\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
do $$
declare a uuid; b uuid; actor uuid; hr uuid; profile uuid; dept uuid; site uuid; emp uuid; other_emp uuid; i uuid; r uuid; fingerprint text;
begin
 if private.canonical_employee_id(chr(160)||'équipe-ß'||chr(65279)) <> 'éQUIPE-ß' or private.canonical_employee_id(E' \tAb-001\n') <> 'AB-001' then raise exception 'JS/SQL canonical contract mismatch'; end if;
 insert into public.agencies(name,code) values('Identity A','ID-A-'||gen_random_uuid()) returning id into a;
 insert into public.agencies(name,code) values('Identity B','ID-B-'||gen_random_uuid()) returning id into b;
 insert into public.profiles(email,full_name,role) values(gen_random_uuid()||'@identity.test','Payroll','agency_manager') returning id into actor;
 insert into public.profiles(email,full_name,role) values(gen_random_uuid()||'@identity.test','RH','hr_central') returning id into hr;
 insert into public.profiles(email,full_name,role) values('identity-employee@example.test','Employee','employee') returning id into profile;
 insert into public.agency_memberships(profile_id,agency_id) values(actor,a);
 site := public.hr_save_site(hr,null,a,'Identity Site','IDS',true,null);
 dept := public.hr_save_department(hr,null,a,'Identity Department',true,null);
 emp := public.hr_create_employee(hr,a,' Ab-001 ','identity-employee@example.test','Employee','Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null);
 update public.employees set profile_id=profile where id=emp;
 perform public.hr_save_private_details(hr,emp,null,'+261 34 00 000 00',null,null,1);
 if not exists(select 1 from public.employees where id=emp and employee_id='AB-001') then raise exception 'RH not canonical'; end if;
 begin perform public.hr_create_employee(hr,a,'ab-001','different@example.test','Duplicate','Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null); raise exception 'case variant duplicated'; exception when unique_violation then null; end;
 insert into public.employees(agency_id,employee_id,email,full_name) values(b,'ab-001','identity-other@example.test','Other agency') returning id into other_emp;
 if other_emp=emp then raise exception 'agency isolation broken'; end if;
 insert into public.payroll_imports(agency_id,period_start,period_end,uploaded_by,source_filename,status)
 values(a,'2026-10-01','2026-10-31',actor,'identity.xlsx','READY_FOR_PREVIEW') returning id into i;
 insert into public.payroll_import_rows(import_id,agency_id,employee_id,employee_email,employee_name,normalized_data)
 values(i,a,'ab-001','identity-employee@example.test','Employee Paie','{"grossAmount":100,"deductionsTotal":10,"netAmount":90}') returning id into r;
 if not exists(select 1 from public.payroll_import_rows where id=r and employee_id='AB-001' and normalized_data->>'employeeId'='AB-001') then raise exception 'alternate client bypassed canonical rule'; end if;
 update public.payroll_import_rows set employee_email='new@example.test' where id=r;
 begin perform public.review_payroll_import(i); raise exception 'review accepted email change'; exception when sqlstate 'PT422' then null; end;
 begin perform public.publish_payroll_import(i,actor,a); raise exception 'legacy publication changed email'; exception when sqlstate 'PT422' then null; end;
 if exists(select 1 from public.payslips where agency_id=a) or exists(select 1 from public.employee_invitations where agency_id=a) or exists(select 1 from public.notifications where recipient_email in ('identity-employee@example.test','new@example.test')) then raise exception 'failed publication left side effects'; end if;
 if not exists(select 1 from public.payroll_imports where id=i and status='READY_FOR_PREVIEW') then raise exception 'failed import not retryable'; end if;
 update public.payroll_import_rows set employee_email='identity-employee@example.test' where id=r;
 fingerprint := public.review_payroll_import(i)->>'fingerprint';
 update public.employees set is_active=false where id=emp;
 begin perform public.publish_payroll_import_reviewed(i,actor,a,fingerprint); raise exception 'disabled case variant published'; exception when sqlstate 'PT409' then null; end;
 begin insert into public.employees(agency_id,employee_id,email,full_name) values(a,'ab-001','bypass@example.test','Bypass'); raise exception 'disabled case variant duplicated'; exception when unique_violation then null; end;
 update public.employees set is_active=true where id=emp;
 fingerprint := public.review_payroll_import(i)->>'fingerprint';
 perform public.publish_payroll_import_reviewed(i,actor,a,fingerprint);
 if (select count(*) from public.employees where agency_id=a) <> 1 then raise exception 'duplicate employee after publication'; end if;
 if not exists(select 1 from public.payslips where employee_id=emp and agency_id=a) then raise exception 'publication lost employee UUID'; end if;
 if not exists(select 1 from public.employees where id=emp and profile_id=profile and email='identity-employee@example.test') then raise exception 'profile/email changed'; end if;
 if not exists(select 1 from public.employee_hr_records where employee_id=emp and job_title='Agent') or not exists(select 1 from public.employee_private_details where employee_id=emp and personal_phone='+261 34 00 000 00') then raise exception 'HR dossier lost'; end if;
 if exists(select 1 from public.employee_invitations where agency_id=a) then raise exception 'unnecessary invitation'; end if;
 raise notice 'PASS: RH lowercase, UUID/profile/HR preservation, agency isolation, duplicate/disabled/email conflicts, retry and atomic publication';
end $$;
rollback;
