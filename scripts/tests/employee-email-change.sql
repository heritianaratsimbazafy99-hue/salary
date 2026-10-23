\set ON_ERROR_STOP on
begin;
insert into public.agencies(id,name,code) values('a8100000-0000-4000-8000-000000000001','Email test','EMAIL-VERIFY-TEST');
insert into auth.users(id,email,email_confirmed_at) values('a8200000-0000-4000-8000-000000000001','email-owner@example.test',now());
insert into public.profiles(id,auth_user_id,email,full_name,role) values
 ('a8300000-0000-4000-8000-000000000001',null,'email-hr@example.test','HR email','hr_central'),
 ('a8300000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000001','email-owner@example.test','Owner email','employee');
do $$
declare hr uuid:='a8300000-0000-4000-8000-000000000001'; owner uuid:='a8300000-0000-4000-8000-000000000002'; a uuid:='a8100000-0000-4000-8000-000000000001'; eid uuid; linked uuid; q uuid; qlinked uuid; value jsonb; rev integer; attempt uuid;
begin
 if has_function_privilege('authenticated','public.begin_employee_email_change(uuid,uuid,text)','execute') or has_function_privilege('anon','public.complete_employee_email_change(uuid,uuid,text,uuid)','execute') or has_table_privilege('authenticated','public.employee_email_verifications','select') then raise exception 'email proofs exposed'; end if;
 eid:=public.agency_create_employee(hr,a,'EMAIL-UNLINKED','unlinked-old@example.test','Unlinked');
 q:=public.agency_request_employee_change(hr,eid,1,1,'EMAIL','unlinked-new@example.test','Correction');
 begin perform public.begin_employee_email_change(q,hr,repeat('a',64)); raise exception 'unapproved request accepted'; exception when sqlstate 'PT409' then null; end;
 insert into public.employee_invitations(agency_id,employee_id,email,full_name,token_hash,invited_by) values(a,'EMAIL-UNLINKED','unlinked-old@example.test','Unlinked',repeat('e',64),hr);
 perform public.hr_decide_employee_change(hr,q,1,true,'Approved proof');
 value:=public.begin_employee_email_change(q,hr,repeat('a',64));
 if exists(select 1 from public.employee_invitations where agency_id=a and employee_id='EMAIL-UNLINKED' and status='PENDING') or not exists(select 1 from public.employee_invitations where agency_id=a and employee_id='EMAIL-UNLINKED' and status='REVOKED') then raise exception 'old invitation not revoked'; end if;
 -- Reservation prevents another agency/profile from taking a target after approval.
 begin insert into auth.users(id,email) values(gen_random_uuid(),'unlinked-new@example.test'); raise exception 'Auth stole reserved address'; exception when unique_violation then null; end;
 begin insert into public.profiles(email,full_name,role) values('unlinked-new@example.test','Intruder','employee'); raise exception 'profile stole reserved address'; exception when unique_violation then null; end;
 begin perform public.agency_create_employee(hr,a,'EMAIL-RESERVED','unlinked-new@example.test','Intruder'); raise exception 'employee stole reserved address'; exception when unique_violation then null; end;
 if value->>'linked'<>'false' or (select email from public.employees where id=eid)<>'unlinked-old@example.test' then raise exception 'premature email mutation'; end if;
 update public.employees set full_name='Concurrent',is_active=false where id=eid;
 begin perform public.complete_employee_email_change(q,null,repeat('a',64)); raise exception 'inactive employee changed identity'; exception when insufficient_privilege then null; end;
 update public.employees set is_active=true where id=eid;
 begin update public.employees set email='forged@example.test' where id=eid; raise exception 'identity race permitted'; exception when sqlstate 'PT409' then null; end;
 update public.employee_employment_lifecycle set revision=revision+1 where employee_id=eid;
 begin perform public.complete_employee_email_change(q,null,repeat('b',64)); raise exception 'forged token accepted'; exception when insufficient_privilege then null; end;
 update public.employee_email_verifications set expires_at=now()-interval '1 minute' where request_id=q;
 begin perform public.complete_employee_email_change(q,null,repeat('a',64)); raise exception 'expired token accepted'; exception when insufficient_privilege then null; end;
 update public.employee_email_verifications set expires_at=now()+interval '1 minute' where request_id=q;
 perform public.complete_employee_email_change(q,null,repeat('a',64));
 perform public.complete_employee_email_change(q,null,repeat('a',64));
 if (select email from public.employees where id=eid)<>'unlinked-new@example.test' or (select profile_id from public.employees where id=eid) is not null or (select count(*) from public.agency_employee_events where employee_id=eid and action='employee.email_verified')<>1 then raise exception 'unlinked proof lost identity or replayed'; end if;
 linked:=public.agency_create_employee(hr,a,'EMAIL-LINKED','email-owner@example.test','Linked');
 update public.employees set profile_id=owner where id=linked;
 select revision into rev from public.employees where id=linked;
 qlinked:=public.agency_request_employee_change(hr,linked,rev,1,'EMAIL','owner-new@example.test','Correction');
 perform public.hr_decide_employee_change(hr,qlinked,1,true,'Approved proof');
 begin perform public.begin_employee_email_change(qlinked,hr); raise exception 'HR changed owner Auth'; exception when insufficient_privilege then null; end;
 value:=public.begin_employee_email_change(qlinked,owner);
 attempt:=(value->>'attemptId')::uuid;
 update public.employee_email_verifications set requested_at=now()-interval '2 minutes' where request_id=qlinked;
 begin perform public.begin_employee_email_change(qlinked,owner); raise exception 'unknown Auth attempt replaced'; exception when sqlstate 'PT409' then if sqlerrm<>'auth_outcome_unknown' then raise; end if; end;
 perform public.settle_employee_email_change(owner,qlinked,gen_random_uuid());
 if not (select auth_request_in_flight from public.employee_email_verifications where request_id=qlinked) then raise exception 'stale attempt released Auth barrier'; end if;
 update public.profiles set is_active=false where id=owner;
 perform public.settle_employee_email_change(owner,qlinked,attempt);
 update public.profiles set is_active=true where id=owner;
 if (select auth_request_in_flight from public.employee_email_verifications where request_id=qlinked) then raise exception 'current attempt did not settle'; end if;
 begin update public.profiles set email='profile-race@example.test' where id=owner; raise exception 'profile changed during Auth workflow'; exception when unique_violation then null; end;
 begin perform public.complete_employee_email_change(qlinked,'a8200000-0000-4000-8000-000000000001'); raise exception 'unverified Auth accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.complete_employee_email_change(qlinked,'a8200000-0000-4000-8000-000000000099'); raise exception 'third party accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.employees(agency_id,employee_id,email,full_name,profile_id) values(a,'RACE-LINK','race-link@example.test','Race',owner); raise exception 'linked profile expanded during verification'; exception when sqlstate 'PT409' then null; end;
 update auth.users set email='owner-new@example.test',email_change='' where id='a8200000-0000-4000-8000-000000000001';
 -- Revoking access after Auth proof cannot prevent RH identity reconciliation.
 update public.employees set is_active=false where id=linked;
 update public.profiles set is_active=false where id=owner;
 update public.agencies set is_active=false where id=a;
 begin perform public.complete_employee_email_change(qlinked,'a8200000-0000-4000-8000-000000000001'); raise exception 'suspended owner completed identity'; exception when insufficient_privilege then null; end;
 if public.reconcile_employee_email_change(hr,qlinked)<>'EXECUTED' then raise exception 'RH failed inactive identity reconciliation'; end if;
 if (select is_active from public.employees where id=linked) or (select is_active from public.profiles where id=owner) then raise exception 'identity reconciliation reactivated access'; end if;
 update public.agencies set is_active=true where id=a;
 update public.employees set is_active=true where id=linked;
 update public.profiles set is_active=true where id=owner;
 perform public.complete_employee_email_change(qlinked,'a8200000-0000-4000-8000-000000000001');
 perform public.complete_employee_email_change(qlinked,'a8200000-0000-4000-8000-000000000001');
 if not exists(select 1 from public.employees where id=linked and profile_id=owner and email='owner-new@example.test') or (select email from public.profiles where id=owner)<>'owner-new@example.test' then raise exception 'verified linked finalisation failed'; end if;
 -- An identity with two employments cannot be silently changed by one agency.
 insert into public.employees(agency_id,employee_id,email,full_name,profile_id) values(a,'MULTI-LINK','multi-link@example.test','Multi',owner);
 select revision into rev from public.employees where id=linked;
 qlinked:=public.agency_request_employee_change(hr,linked,rev,1,'EMAIL','owner-third@example.test','Correction');
 perform public.hr_decide_employee_change(hr,qlinked,1,true,'Approved proof');
 begin perform public.begin_employee_email_change(qlinked,owner); raise exception 'multi employment identity changed'; exception when sqlstate 'PT409' then if sqlerrm<>'multi_employment_hr_arbitration' then raise; end if; end;
 select revision into rev from public.employees where id=eid;
 q:=public.agency_request_employee_change(hr,eid,rev,2,'EMAIL','expired-proof@example.test','Expired correction');
 perform public.hr_decide_employee_change(hr,q,1,true,'Verify');
 perform public.begin_employee_email_change(q,hr,repeat('d',64));
 update public.employee_email_verifications set expires_at=now()-interval '1 minute' where request_id=q;
 perform private.purge_agency_employee_events(now());
 if exists(select 1 from public.employee_email_verifications where request_id=q) or not exists(select 1 from public.agency_employee_change_requests where id=q and status='REJECTED') then raise exception 'expired proof not cancelled automatically'; end if;

end $$;
-- Runtime role coverage: RPCs use service_role, never the migration owner.
do $$
declare e uuid; linked uuid;
begin
 e:=public.agency_create_employee('a8300000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','SERVICE-EMAIL','service-old@example.test','Service proof');
 linked:=public.agency_create_employee('a8300000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','SERVICE-LINKED','service-owner@example.test','Service owner');
 insert into auth.users(id,email,email_confirmed_at) values('a8200000-0000-4000-8000-000000000002','service-owner@example.test',now());
 insert into public.profiles(id,auth_user_id,email,full_name,role) values('a8300000-0000-4000-8000-000000000003','a8200000-0000-4000-8000-000000000002','service-owner@example.test','Service owner','employee');
 update public.employees set profile_id='a8300000-0000-4000-8000-000000000003' where id=linked;
 perform set_config('test.service_email_employee',e::text,true);
 perform set_config('test.service_email_linked',linked::text,true);
end $$;
set local role service_role;
do $$
declare e uuid:=current_setting('test.service_email_employee')::uuid; linked uuid:=current_setting('test.service_email_linked')::uuid;
 hr uuid:='a8300000-0000-4000-8000-000000000001'; owner uuid:='a8300000-0000-4000-8000-000000000003'; q uuid; rev integer; result jsonb;
begin
 if has_table_privilege('service_role','auth.users','select') then raise exception 'broad Auth SELECT was granted'; end if;
 begin perform 1 from auth.users limit 1; raise exception 'direct Auth read permitted'; exception when insufficient_privilege then null; end;
 q:=public.agency_request_employee_change(hr,e,1,1,'EMAIL','service-new@example.test','Runtime proof');
 perform public.hr_decide_employee_change(hr,q,1,true,'Approve');
 result:=public.begin_employee_email_change(q,hr,repeat('f',64));
 if result->>'linked'<>'false' then raise exception 'runtime unlinked begin failed'; end if;
 perform public.complete_employee_email_change(q,null,repeat('f',64));
 select revision into rev from public.employees where id=e;
 q:=public.agency_request_employee_change(hr,e,rev,1,'EMAIL','service-cancel@example.test','Runtime cancel');
 perform public.hr_decide_employee_change(hr,q,1,true,'Approve');
 perform public.begin_employee_email_change(q,hr,repeat('c',64));
 if public.reconcile_employee_email_change(hr,q)<>'CANCELLED' then raise exception 'runtime cancellation failed'; end if;
 select revision into rev from public.employees where id=linked;
 q:=public.agency_request_employee_change(hr,linked,rev,1,'EMAIL','service-owner-new@example.test','Runtime linked');
 perform public.hr_decide_employee_change(hr,q,1,true,'Approve');
 result:=public.begin_employee_email_change(q,owner);
 perform public.settle_employee_email_change(owner,q,(result->>'attemptId')::uuid);
 begin perform public.complete_employee_email_change(q,'a8200000-0000-4000-8000-000000000002'); raise exception 'runtime unverified Auth accepted'; exception when sqlstate 'PT409' then if sqlerrm<>'verification_pending' then raise; end if; end;
 perform set_config('test.service_email_request',q::text,true);
end $$;
reset role;
update auth.users set email='service-owner-new@example.test',email_change='' where id='a8200000-0000-4000-8000-000000000002';
set local role service_role;
do $$
declare q uuid:=current_setting('test.service_email_request')::uuid;
begin
 if public.reconcile_employee_email_change('a8300000-0000-4000-8000-000000000001',q)<>'EXECUTED' then raise exception 'runtime linked reconciliation failed'; end if;
 if not public.complete_employee_email_change(q,'a8200000-0000-4000-8000-000000000002') then raise exception 'runtime linked completion failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform private.employee_email_auth_state('a8200000-0000-4000-8000-000000000002'); raise exception 'anon Auth state helper exposed'; exception when insufficient_privilege then null; end;
 begin perform private.employee_email_auth_collision('service-owner-new@example.test',null); raise exception 'anon Auth collision helper exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform private.employee_email_auth_state('a8200000-0000-4000-8000-000000000002'); raise exception 'authenticated Auth state helper exposed'; exception when insufficient_privilege then null; end;
 begin perform private.employee_email_auth_collision('service-owner-new@example.test',null); raise exception 'authenticated Auth collision helper exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
