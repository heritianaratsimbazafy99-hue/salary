\set ON_ERROR_STOP on
begin;
insert into public.agencies(id,name,code) values('a9100000-0000-4000-8000-000000000001','Payroll email safety','PAYROLL-EMAIL-SAFETY');
insert into auth.users(id,email,email_confirmed_at) values('a9200000-0000-4000-8000-000000000001','delivery-old@example.test',now());
insert into public.profiles(id,email,full_name,role) values('a9300000-0000-4000-8000-000000000001','delivery-hr@example.test','RH','hr_central');
insert into public.profiles(id,auth_user_id,email,full_name,role) values('a9300000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000001','delivery-old@example.test','Owner','employee');
do $$
declare linked uuid; unlinked uuid; q uuid; rev integer;
begin
 linked:=public.agency_create_employee('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','DELIVERY-LINKED','delivery-old@example.test','Owner');
 update public.employees set profile_id='a9300000-0000-4000-8000-000000000002' where id=linked;
 select revision into rev from public.employees where id=linked;
 q:=public.agency_request_employee_change('a9300000-0000-4000-8000-000000000001',linked,rev,1,'EMAIL','delivery-new@example.test','Correction');
 perform public.hr_decide_employee_change('a9300000-0000-4000-8000-000000000001',q,1,true,'Approved proof');
 unlinked:=public.agency_create_employee('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','DELIVERY-UNLINKED','delivery-unlinked@example.test','Unlinked');
 q:=public.agency_request_employee_change('a9300000-0000-4000-8000-000000000001',unlinked,1,1,'EMAIL','delivery-unlinked-new@example.test','Correction');
 perform public.hr_decide_employee_change('a9300000-0000-4000-8000-000000000001',q,1,true,'Approved proof');
end $$;
set local role service_role;
do $$
begin
 if not public.payroll_email_delivery_allowed('a9100000-0000-4000-8000-000000000001','delivery-old@example.test') then raise exception 'official verified old mailbox blocked before proof'; end if;
 if public.payroll_email_delivery_allowed('a9100000-0000-4000-8000-000000000001','delivery-unlinked@example.test') then raise exception 'unlinked verification pending allowed'; end if;
 begin
  insert into public.employee_invitations(agency_id,employee_id,email,full_name,token_hash,invited_by) values('a9100000-0000-4000-8000-000000000001','DELIVERY-UNLINKED','delivery-unlinked@example.test','Unlinked',repeat('d',64),'a9300000-0000-4000-8000-000000000001');
  raise exception 'old activation invitation recreated';
 exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
update auth.users set email='delivery-new@example.test' where id='a9200000-0000-4000-8000-000000000001';
set local role service_role;
do $$
begin
 if public.payroll_email_delivery_allowed('a9100000-0000-4000-8000-000000000001','delivery-old@example.test') then raise exception 'old mailbox allowed after Auth proof'; end if;
 if has_function_privilege('authenticated','public.payroll_email_delivery_allowed(uuid,text)','execute') or has_function_privilege('anon','public.payroll_email_delivery_allowed(uuid,text)','execute') then raise exception 'Auth lookup RPC exposed'; end if;
end $$;
reset role;
rollback;
