\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
insert into public.agencies(id,name,code) values
 ('e1000000-0000-4000-8000-000000000001','Imports A','EMP-IMPORT-A'),
 ('e1000000-0000-4000-8000-000000000002','Imports B','EMP-IMPORT-B');
insert into auth.users(id,email) values
 ('e2000000-0000-4000-8000-000000000001','import-manager-one@example.test'),
 ('e2000000-0000-4000-8000-000000000002','import-manager-two@example.test'),
 ('e2000000-0000-4000-8000-000000000003','import-manager-other@example.test');
insert into public.profiles(id,auth_user_id,email,full_name,role) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','import-manager-one@example.test','Responsable 1','agency_manager'),
 ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','import-manager-two@example.test','Responsable 2','agency_manager'),
 ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','import-manager-other@example.test','Responsable B','agency_manager');
insert into public.agency_memberships(profile_id,agency_id) values
 ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001'),
 ('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001'),
 ('e3000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002');
create temporary table employee_import_test_ids(id uuid);
grant select on employee_import_test_ids to authenticated;
set local role service_role;
do $$
declare
 a uuid:='e1000000-0000-4000-8000-000000000001'; b uuid:='e1000000-0000-4000-8000-000000000002';
 m1 uuid:='e3000000-0000-4000-8000-000000000001'; m2 uuid:='e3000000-0000-4000-8000-000000000002'; mb uuid:='e3000000-0000-4000-8000-000000000003';
 i uuid; fp text; n integer; eid uuid; payload jsonb;
begin
 if has_function_privilege('anon','public.agency_preview_employee_import(uuid,uuid,jsonb)','execute')
 or has_function_privilege('authenticated','public.agency_commit_employee_import(uuid,uuid,text)','execute')
 or has_table_privilege('authenticated','public.employee_import_rows','insert') then raise exception 'employee import grants unsafe'; end if;
 begin perform public.agency_preview_employee_import(m1,a,null); raise exception 'NULL import accepted'; exception when sqlstate '22023' then null; end;
 payload:='[{"row_number":2,"matricule":" 00001 ","nom_complet":"Personne 1","email":"import-one@example.test","issues":[]},{"row_number":3,"matricule":"AB-002","nom_complet":"Personne 2","email":"import-two@example.test","issues":[]}]';
 i:=public.agency_preview_employee_import(m1,a,payload);
 select fingerprint into fp from public.employee_imports where id=i;
 begin perform public.agency_commit_employee_import(mb,i,fp); raise exception 'other agency committed'; exception when sqlstate '42501' then null; end;
 n:=public.agency_commit_employee_import(m2,i,fp);
 if n<>2 or public.agency_commit_employee_import(m1,i,fp)<>2 then raise exception 'idempotence failed'; end if;
 if (select count(*) from public.employees where agency_id=a)<>2 then raise exception 'replay duplicated'; end if;
 if not exists(select 1 from public.agency_employee_events where employee_import_id=i and actor_profile_id=m2 and employee_import_created_count=2) then raise exception 'minimal audit missing'; end if;
 if exists(select 1 from public.payslips where agency_id=a) or exists(select 1 from public.employee_invitations where agency_id=a) then raise exception 'automatic payroll/invitation side effect'; end if;
 -- Identical files never overwrite existing dossiers or provision accounts.
 i:=public.agency_preview_employee_import(m1,a,payload);
 if exists(select 1 from public.employee_import_rows where import_id=i and classification<>'IDENTICAL') then raise exception 'identical not ignored'; end if;
 select fingerprint into fp from public.employee_imports where id=i;
 if public.agency_commit_employee_import(m2,i,fp)<>0 then raise exception 'identical recreated'; end if;
 -- Invalid rows, duplicate identities, email reuse and disabled/archive classifications.
 select id into eid from public.employees where agency_id=a and employee_id='00001';
 update public.employees set is_active=false where id=eid;
 i:=public.agency_preview_employee_import(m1,a,payload);
 if not exists(select 1 from public.employee_import_rows where import_id=i and row_number=2 and classification='DISABLED') then raise exception 'disabled identity accepted'; end if;
 update public.employees set is_active=true where id=eid;
 update public.employee_employment_lifecycle set state='DEPARTED',departed_on=current_date,departure_reason='Test',revision=revision+1 where employee_id=eid;
 i:=public.agency_preview_employee_import(m1,a,payload);
 if not exists(select 1 from public.employee_import_rows where import_id=i and classification='ARCHIVED') then raise exception 'archived identity accepted'; end if;
 payload:='[{"row_number":2,"matricule":"NEW","nom_complet":"Nouveau","email":"import-new@example.test","issues":[]},{"row_number":3,"matricule":"","nom_complet":"Invalide","email":"invalid@example.test","issues":[]}]';
 i:=public.agency_preview_employee_import(m1,a,payload);
 select fingerprint into fp from public.employee_imports where id=i;
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'invalid lot committed'; exception when sqlstate '22023' then null; end;
 if exists(select 1 from public.employees where agency_id=a and employee_id='NEW') then raise exception 'partial lot persisted'; end if;
 perform public.agency_review_employee_import(m2,i,fp,array[3]);
 select fingerprint into fp from public.employee_imports where id=i;
 if public.agency_commit_employee_import(m1,i,fp)<>1 then raise exception 'exclusion not applied'; end if;
 payload:='[{"row_number":2,"matricule":"dup","nom_complet":"Doublon","email":"dup1@example.test","issues":[]},{"row_number":3,"matricule":"DUP","nom_complet":"Doublon","email":"dup2@example.test","issues":[]}]';
 i:=public.agency_preview_employee_import(m1,a,payload);
 if (select count(*) from public.employee_import_rows where import_id=i and classification='DUPLICATE')<>2 then raise exception 'canonical duplicate not detected'; end if;
 payload:='[{"row_number":2,"matricule":"RACE","nom_complet":"Race","email":"race@example.test","issues":[]}]';
 i:=public.agency_preview_employee_import(m1,a,payload); select fingerprint into fp from public.employee_imports where id=i;
 perform public.agency_create_employee(m2,a,'RACE','race@example.test','Race');
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'concurrent creation accepted stale review'; exception when sqlstate 'PT409' then null; end;
 perform public.agency_review_employee_import(m1,i,fp,'{}'); select fingerprint into fp from public.employee_imports where id=i;
 if public.agency_commit_employee_import(m1,i,fp)<>0 then raise exception 'race review not idempotent'; end if;
 -- Every identity/lifecycle revision invalidates review even if displayed classification stays identical.
 select id into eid from public.employees where agency_id=a and employee_id='RACE';
 i:=public.agency_preview_employee_import(m1,a,payload); select fingerprint into fp from public.employee_imports where id=i;
 update public.employee_employment_lifecycle set revision=revision+1 where employee_id=eid;
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'lifecycle revision omitted from fingerprint'; exception when sqlstate 'PT409' then null; end;
 perform public.agency_review_employee_import(m1,i,fp,'{}'); select fingerprint into fp from public.employee_imports where id=i;
 begin perform public.agency_commit_employee_import(m1,i,null); raise exception 'NULL fingerprint bypass'; exception when sqlstate 'PT409' then null; end;
 update public.profiles set is_active=false where id=m1;
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'inactive actor committed'; exception when sqlstate '42501' then null; end;
 update public.profiles set is_active=true where id=m1;
 update public.agency_memberships set agency_id=b where profile_id=m1;
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'removed membership committed'; exception when sqlstate '42501' then null; end;
 update public.agency_memberships set agency_id=a where profile_id=m1;
 i:=public.agency_preview_employee_import(m1,a,'[{"row_number":2,"matricule":"GLOBAL","nom_complet":"Compte réservé","email":"import-manager-other@example.test","issues":[]}]');
 if not exists(select 1 from public.employee_import_rows where import_id=i and classification='CONFLICT') then raise exception 'existing global account silently matched'; end if;
 i:=public.agency_preview_employee_import(m1,a,jsonb_build_array(jsonb_build_object('row_number',2,'matricule',repeat('a',81),'nom_complet','Invalid','email','long@example.test','issues','[]'::jsonb)));
 if not exists(select 1 from public.employee_import_rows where import_id=i and classification='INVALID') then raise exception 'overlong identity not persisted as invalid'; end if;
 select fingerprint into fp from public.employee_imports where id=i;
 update public.employee_imports set expires_at=now()-interval '1 second' where id=i;
 begin perform public.agency_commit_employee_import(m1,i,fp); raise exception 'expired report committed'; exception when sqlstate 'PT410' then null; end;
 raise notice 'PASS imports: atomicity, replay, same agency managers, creation-only, duplicate/disabled/archive/errors, exclusion, stale review';
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.agency_preview_employee_import(gen_random_uuid(),gen_random_uuid(),'[]'); raise exception 'anon preview exposed'; exception when insufficient_privilege then null; end;
 begin perform public.agency_review_employee_import(gen_random_uuid(),gen_random_uuid(),'bad','{}'); raise exception 'anon review exposed'; exception when insufficient_privilege then null; end;
 begin perform public.agency_commit_employee_import(gen_random_uuid(),gen_random_uuid(),'bad'); raise exception 'anon commit exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.agency_preview_employee_import(gen_random_uuid(),gen_random_uuid(),'[]'); raise exception 'authenticated forged preview actor'; exception when insufficient_privilege then null; end;
 begin perform public.agency_review_employee_import(gen_random_uuid(),gen_random_uuid(),'bad','{}'); raise exception 'authenticated forged review actor'; exception when insufficient_privilege then null; end;
 begin perform public.agency_commit_employee_import(gen_random_uuid(),gen_random_uuid(),'bad'); raise exception 'authenticated forged commit actor'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Retained reports are readable by another manager in A, never B, and invisible at expiration before cron.
insert into employee_import_test_ids select id from public.employee_imports where agency_id='e1000000-0000-4000-8000-000000000001' and expires_at>now();
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
do $$ begin if not exists(select 1 from public.employee_imports where id in(select id from employee_import_test_ids)) then raise exception 'second manager cannot read report'; end if; end $$;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.employee_imports where id in(select id from employee_import_test_ids)) or exists(select 1 from public.employee_import_rows where import_id in(select id from employee_import_test_ids)) then raise exception 'cross-agency report leak'; end if; end $$;
reset role;
update public.employee_imports set expires_at=now()-interval '1 second' where agency_id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
do $$ begin if exists(select 1 from public.employee_imports where id in(select id from employee_import_test_ids)) or exists(select 1 from public.employee_import_rows where import_id in(select id from employee_import_test_ids)) then raise exception 'expired report readable'; end if; end $$;
reset role;
select private.purge_employee_imports();
do $$ begin if exists(select 1 from public.employee_imports where agency_id='e1000000-0000-4000-8000-000000000001') then raise exception 'purge failed'; end if;
 if not exists(select 1 from public.agency_employee_events where agency_id='e1000000-0000-4000-8000-000000000001' and employee_import_id is not null) then raise exception 'purge erased audit'; end if;
 if (select count(*) from public.employees where agency_id='e1000000-0000-4000-8000-000000000001')<>4 then raise exception 'purge deleted employees'; end if;
end $$;
rollback;
