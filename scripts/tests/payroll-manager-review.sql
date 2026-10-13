\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
create function pg_temp.reject_review_audit() returns trigger language plpgsql as $$
begin
 if new.action = 'PAYROLL_ROW_ADJUSTED' and new.metadata->>'reason' = 'Force rollback' then
  raise exception 'test audit unavailable';
 end if;
 return new;
end $$;
create trigger test_reject_review_audit before insert on public.audit_logs
for each row execute function pg_temp.reject_review_audit();
-- Local, rollback-only checks of server RPC authorization and publication revisions.
do $$
declare
 a uuid; b uuid; actor uuid; i uuid; r uuid; emp uuid; slip uuid;
 fingerprint text; revision timestamptz; changed_fingerprint text; publications integer;
begin
 insert into public.agencies(name,code) values('Review A','REVIEW-A-' || gen_random_uuid()) returning id into a;
 insert into public.agencies(name,code) values('Review B','REVIEW-B-' || gen_random_uuid()) returning id into b;
 insert into public.profiles(email,full_name,role) values(gen_random_uuid() || '@review.invalid','Manager','agency_manager') returning id into actor;
 insert into public.agency_memberships(profile_id,agency_id) values(actor,a);
 insert into public.payroll_imports(agency_id,period_start,period_end,uploaded_by,source_filename,status)
 values(a,'2026-01-01','2026-01-31',actor,'review.csv','READY_FOR_PREVIEW') returning id into i;
 insert into public.payroll_import_rows(import_id,agency_id,employee_id,employee_email,employee_name,normalized_data)
 values(i,a,'EMP-REVIEW','employee@review.invalid','Employee','{"grossAmount":100,"deductionsTotal":10,"netAmount":90}') returning id,updated_at into r,revision;
 fingerprint := public.review_payroll_import(i)->>'fingerprint';
 if has_function_privilege('authenticated','public.adjust_payroll_import_row(uuid,uuid,uuid,uuid,timestamptz,jsonb,text)','execute')
  or has_function_privilege('authenticated','public.publish_payroll_import_reviewed(uuid,uuid,uuid,text)','execute') then raise exception 'Mutation RPC exposed'; end if;
 perform public.adjust_payroll_import_row(i,r,actor,a,revision,'{"grossAmount":110}','Valid reason');
 if (select normalized_data->>'grossAmount' from public.payroll_import_rows where id=r) <> '110'
  or not exists(select 1 from public.audit_logs where resource_id=r and action='PAYROLL_ROW_ADJUSTED') then raise exception 'Correction or audit missing'; end if;
 changed_fingerprint := public.review_payroll_import(i)->>'fingerprint';
 if changed_fingerprint = fingerprint then raise exception 'Correction did not invalidate review'; end if;
 begin
  perform public.adjust_payroll_import_row(i,r,actor,a,(select updated_at from public.payroll_import_rows where id=r),'{"grossAmount":999}','Force rollback');
  raise exception 'Audit failure accepted';
 exception when others then if sqlerrm <> 'test audit unavailable' then raise; end if; end;
 if public.review_payroll_import(i)->>'fingerprint' is distinct from changed_fingerprint then raise exception 'Audit failure did not roll back correction'; end if;
 begin perform public.adjust_payroll_import_row(i,r,actor,a,revision,'{"grossAmount":120}','Stale reason'); raise exception 'Stale correction accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.publish_payroll_import_reviewed(i,actor,a,fingerprint); raise exception 'Stale review published'; exception when sqlstate 'PT409' then null; end;
 -- Import metadata is also part of the review; no updated_at side effect is needed.
 update public.payroll_imports set period_end='2026-02-01' where id=i;
 if public.review_payroll_import(i)->>'fingerprint' = changed_fingerprint then raise exception 'Import metadata omitted from fingerprint'; end if;
 fingerprint := public.review_payroll_import(i)->>'fingerprint';
 update public.agency_memberships set agency_id=b where profile_id=actor;
 begin perform public.publish_payroll_import_reviewed(i,actor,a,fingerprint); raise exception 'Reassigned manager published old agency'; exception when insufficient_privilege then null; end;
 update public.agency_memberships set agency_id=a where profile_id=actor;
 update public.profiles set is_active=false where id=actor;
 begin perform public.publish_payroll_import(i,actor,a); raise exception 'Legacy RPC accepted disabled manager'; exception when insufficient_privilege then null; end;
 update public.profiles set is_active=true where id=actor;
 update public.agencies set is_active=false where id=a;
 begin perform public.publish_payroll_import(i,actor,a); raise exception 'Legacy RPC accepted disabled agency'; exception when insufficient_privilege then null; end;
 update public.agencies set is_active=true where id=a;
 insert into public.employees(agency_id,employee_id,email,full_name,is_active)
 values(a,'EMP-REVIEW','employee@review.invalid','Employee',false) returning id into emp;
 begin perform public.publish_payroll_import_reviewed(i,actor,a,fingerprint); raise exception 'Disabled employee published'; exception when sqlstate 'PT409' then null; end;
 begin perform public.publish_payroll_import(i,actor,a); raise exception 'Legacy RPC reactivated employee'; exception when sqlstate 'PT409' then null; end;
 if (select is_active from public.employees where id=emp) then raise exception 'Employee reactivated'; end if;
 update public.employees set is_active=true where id=emp;
 select published_count into publications from public.publish_payroll_import_reviewed(i,actor,a,fingerprint);
 if publications <> 1 then raise exception 'Unexpected publication count'; end if;
 select id into slip from public.payslips where employee_id=emp;
 if not exists(select 1 from public.payslips where id=slip and expires_at=published_at + interval '1 year') then raise exception 'Publication expiry missing'; end if;
 begin update public.payroll_import_rows set normalized_data='{}' where id=r; raise exception 'Published row changed'; exception when insufficient_privilege then null; end;
 begin insert into public.payroll_import_rows(import_id,agency_id,employee_id,employee_email,employee_name,normalized_data)
 values(i,a,'ANOTHER','another@review.invalid','Another','{}'); raise exception 'Published row inserted'; exception when insufficient_privilege then null; end;
 begin update public.payslip_versions set snapshot_data='{}' where payslip_id=slip; raise exception 'Published snapshot changed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: complete fingerprint, stale revisions, live lifecycle, legacy RPC, immutable publication and expiration';
end $$;
rollback;
