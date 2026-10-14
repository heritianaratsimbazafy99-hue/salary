\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
-- Rollback-only checks: private bucket, document lifecycle and owner-only visibility.
insert into public.agencies(id,name,code) values('e1000000-0000-4000-8000-000000000001','Docs A','DOCS-A-TEST');
insert into auth.users(id,email) values
('e2000000-0000-4000-8000-000000000001','doc-owner@example.test'),
('e2000000-0000-4000-8000-000000000002','doc-other@example.test'),
('e2000000-0000-4000-8000-000000000003','doc-manager@example.test'),
('e2000000-0000-4000-8000-000000000004','doc-payroll@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
('e3000000-0000-4000-8000-000000000001',null,'doc-hr@example.test','RH','hr_central'),
('e3000000-0000-4000-8000-000000000002',null,'doc-super@example.test','Super','super_admin'),
('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','doc-owner@example.test','Owner','employee'),
('e3000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000002','doc-other@example.test','Other','employee'),
('e3000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000004','doc-payroll@example.test','Payroll','agency_manager');
insert into public.agency_memberships(profile_id,agency_id) values('e3000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001');
insert into public.employees(id,agency_id,profile_id,employee_id,email,full_name) values
('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003','DOC-1','doc-owner@example.test','Owner'),
('e4000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000004','DOC-2','doc-other@example.test','Other');
create function pg_temp.reject_document_audit() returns trigger language plpgsql as $$
begin
 if new.action = 'hr_document.uploaded' and new.metadata->>'size_bytes' = '999' then raise exception 'test audit unavailable'; end if;
 return new;
end $$;
create trigger test_reject_document_audit before insert on public.audit_logs for each row execute function pg_temp.reject_document_audit();

do $$
declare
 hr constant uuid := 'e3000000-0000-4000-8000-000000000001';
 a constant uuid := 'e1000000-0000-4000-8000-000000000001';
 owner constant uuid := 'e4000000-0000-4000-8000-000000000001';
 other constant uuid := 'e4000000-0000-4000-8000-000000000002';
 site uuid; dept uuid; manager uuid; contract uuid; pending uuid; withdrawn uuid; rolled uuid; path text;
begin
 if not exists(select 1 from storage.buckets where id='hr-documents' and not public and file_size_limit=10485760) then raise exception 'private bucket missing'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'hr-documents') then raise exception 'client storage policy on HR bucket'; end if;
 if has_function_privilege('authenticated','public.hr_begin_document_upload(uuid,uuid,public.hr_document_category,text,date,text,text,integer)','execute')
  or has_function_privilege('authenticated','public.hr_complete_document_upload(uuid,uuid,text,integer)','execute')
  or has_function_privilege('authenticated','public.hr_withdraw_document(uuid,uuid,text)','execute')
  or has_column_privilege('authenticated','public.employee_documents','storage_path','select')
  or has_table_privilege('authenticated','public.employee_documents','insert') then raise exception 'document internals exposed'; end if;

 site := public.hr_save_site(hr,null,a,'Zital','ZITAL',true,null);
 dept := public.hr_save_department(hr,null,a,'Service',true,null);
 manager := public.admin_save_hr_access('e3000000-0000-4000-8000-000000000002',null,'e2000000-0000-4000-8000-000000000003','doc-manager@example.test','Manager','team_manager',true,
  jsonb_build_array(jsonb_build_object('agency_id',a,'department_id',dept)),null);
 perform public.hr_save_employee_record(hr,owner,'Agent',dept,site,null,null,'ACTIVE','CDI','2026-01-01',null,null);

 begin perform public.hr_begin_document_upload(manager,owner,'CONTRACT','Contrat','2026-01-01',null,'application/pdf',100); raise exception 'manager uploaded';
 exception when sqlstate '42501' then null; end;
 begin perform public.hr_begin_document_upload('e3000000-0000-4000-8000-000000000005',owner,'CONTRACT','Contrat','2026-01-01',null,'application/pdf',100); raise exception 'payroll manager uploaded';
 exception when sqlstate '42501' then null; end;
 begin perform public.hr_begin_document_upload(hr,owner,'HISTORICAL_PAYSLIP','Bulletin','2025-06-30',null,'application/pdf',100); raise exception 'payslip without period';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_begin_document_upload(hr,owner,'CONTRACT','Contrat','2026-01-01','2026-01','application/pdf',100); raise exception 'contract with period';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_begin_document_upload(hr,owner,'CONTRACT','Contrat','2026-01-01',null,'image/gif',100); raise exception 'gif accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.hr_begin_document_upload(hr,owner,'CONTRACT','Contrat','2026-01-01',null,'application/pdf',10485761); raise exception 'oversized accepted';
 exception when sqlstate '22023' then null; end;

 select d.document_id, d.storage_path into contract, path from public.hr_begin_document_upload(hr,owner,'CONTRACT',' Contrat CDI ','2026-01-01',null,'application/pdf',2048) d;
 if path <> a::text || '/' || owner::text || '/' || contract::text then raise exception 'storage path not derived from ids'; end if;
 begin perform public.hr_complete_document_upload(hr,contract,'image/png',2048); raise exception 'mismatched signature accepted';
 exception when sqlstate '22023' then null; end;
 if (select status from public.employee_documents where id=contract) <> 'PENDING' then raise exception 'mismatch changed state'; end if;
 perform public.hr_complete_document_upload(hr,contract,'application/pdf',2048);
 if (select status from public.employee_documents where id=contract) <> 'AVAILABLE' or not exists(select 1 from public.audit_logs where resource_id=contract and action='hr_document.uploaded') then raise exception 'completion or audit missing'; end if;
 begin perform public.hr_complete_document_upload(hr,contract,'application/pdf',2048); raise exception 'double completion';
 exception when sqlstate 'PT409' then null; end;

 select d.document_id into rolled from public.hr_begin_document_upload(hr,owner,'ADMINISTRATIVE','Rollback','2026-01-01',null,'image/png',999) d;
 begin perform public.hr_complete_document_upload(hr,rolled,'image/png',999); raise exception 'audit failure accepted';
 exception when others then if sqlerrm <> 'test audit unavailable' then raise; end if; end;
 if (select status from public.employee_documents where id=rolled) <> 'PENDING' then raise exception 'document available without audit'; end if;
 if public.hr_reject_document_upload(hr,rolled) <> a::text || '/' || owner::text || '/' || rolled::text then raise exception 'reject did not return path'; end if;

 select d.document_id into pending from public.hr_begin_document_upload(hr,owner,'HISTORICAL_PAYSLIP','Bulletin juin','2025-06-30','2025-06','application/pdf',4096) d;
 select d.document_id into withdrawn from public.hr_begin_document_upload(hr,owner,'ADMINISTRATIVE','Erreur de dossier','2026-01-02',null,'image/jpeg',512) d;
 perform public.hr_complete_document_upload(hr,withdrawn,'image/jpeg',512);
 begin perform public.hr_withdraw_document(hr,withdrawn,''); raise exception 'withdraw without reason';
 exception when sqlstate '22023' then null; end;
 perform public.hr_withdraw_document(hr,withdrawn,'Déposé sur le mauvais salarié');
 begin perform public.hr_withdraw_document(hr,withdrawn,'Encore'); raise exception 'double withdraw';
 exception when sqlstate 'PT409' then null; end;
end $$;

-- Owner: available documents only, metadata only.
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if (select array_agg(title) from public.employee_documents) <> array['Contrat CDI'] then raise exception 'owner visibility wrong'; end if;
 begin perform storage_path from public.employee_documents; raise exception 'storage path readable';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='hr-documents') then raise exception 'owner lists storage objects'; end if;
end $$;
reset role;

-- Another employee, the team manager and the payroll manager see nothing.
do $$ declare sub text; begin
 foreach sub in array array['e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000004'] loop
  perform set_config('request.jwt.claims', jsonb_build_object('sub',sub,'role','authenticated')::text, true);
  set local role authenticated;
  if exists(select 1 from public.employee_documents) then raise exception 'document visible to %', sub; end if;
  reset role;
 end loop;
end $$;

-- A deactivated employment hides the documents on the open session.
update public.employees set is_active=false where id='e4000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin if exists(select 1 from public.employee_documents) then raise exception 'deactivated owner keeps documents'; end if; end $$;
reset role;
rollback;
