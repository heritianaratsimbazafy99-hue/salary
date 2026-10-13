-- Deliberately fictional data; UUID suffixes map actors and records for assertions.
insert into auth.users(id,email,email_confirmed_at)
select ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'synthetic-' || n || '@example.invalid', now() from generate_series(1,5) n;
insert into public.profiles(id,auth_user_id,email,full_name,role)
select ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'synthetic-' || n || '@example.invalid','Synthetic actor ' || n,
       (case n when 1 then 'agency_manager' when 2 then 'agency_manager' when 5 then 'hr_central' else 'employee' end)::public.app_role
from generate_series(1,5) n;
insert into public.agencies(id,name,code)
select ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'Synthetic agency '||n,'SYN'||n from generate_series(1,2) n;
insert into public.agency_memberships(profile_id,agency_id)
select ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name)
select ('40000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('20000000-0000-0000-0000-' || lpad((n+2)::text,12,'0'))::uuid,
 'SYN'||n,'synthetic-'||(n+2)||'@example.invalid','Synthetic employee '||n from generate_series(1,2) n;
insert into public.payroll_imports(id,agency_id,period_start,period_end,uploaded_by,status,source_filename)
select ('50000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'2026-09-01','2026-09-30',
 ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'PUBLISHED','synthetic.csv' from generate_series(1,2) n;
insert into public.payslips(id,agency_id,employee_id,period_start,period_end,published_by)
select ('60000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('40000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'2026-09-01','2026-09-30',
 ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
insert into public.payslip_versions(id,payslip_id,import_id,agency_id,version_number,snapshot_data,pay_items,published_by)
select ('70000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('60000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('50000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,1,'{"synthetic":true,"net_pay":1000}', '[]',
 ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
update public.payslips p set current_version_id=v.id from public.payslip_versions v where v.payslip_id=p.id;
insert into public.audit_logs(actor_profile_id,actor_role,action,resource_type,metadata)
values ('20000000-0000-0000-0000-000000000005','hr_central','synthetic.restore_drill','verification','{"synthetic":true}');
insert into public.export_jobs(requested_by,export_type)
values ('20000000-0000-0000-0000-000000000005','synthetic_restore_drill');
