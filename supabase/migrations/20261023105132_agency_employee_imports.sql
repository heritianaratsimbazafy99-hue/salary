-- Creation-only employee imports. Source workbooks are never stored.
alter table public.agency_employee_events add column employee_import_id uuid, add column employee_import_created_count integer;
create table public.employee_imports (
 id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
 uploaded_by uuid not null references public.profiles(id), reviewed_by uuid not null references public.profiles(id),
 committed_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '30 days'),
 committed_at timestamptz, status text not null default 'INVALID' check(status in ('INVALID','READY','COMMITTED')),
 fingerprint text not null default '', created_count integer not null default 0,
 check(expires_at <= created_at + interval '30 days')
);
create table public.employee_import_rows (
 import_id uuid not null references public.employee_imports(id) on delete cascade,
 row_number integer not null check(row_number>=2), matricule text not null, nom_complet text not null, email text not null,
 issues jsonb not null default '[]' check(jsonb_typeof(issues)='array'), excluded boolean not null default false,
 classification text not null default 'INVALID', employee_uuid uuid, expected_revision integer, expected_lifecycle_revision integer,
 primary key(import_id,row_number)
);
create index employee_imports_agency_created on public.employee_imports(agency_id,created_at desc);
create index employee_imports_expiration on public.employee_imports(expires_at);
alter table public.employee_imports enable row level security;
alter table public.employee_import_rows enable row level security;
create function private.can_read_employee_import(p_agency_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.agencies a on a.id=p_agency_id
 where p.id=private.current_profile_id() and p.is_active and a.is_active and
 (p.role in ('hr_central','super_admin') or (p.role='agency_manager' and exists
 (select 1 from public.agency_memberships m where m.profile_id=p.id and m.agency_id=a.id))))
$$;
revoke all on function private.can_read_employee_import(uuid) from public,anon;
grant execute on function private.can_read_employee_import(uuid) to authenticated,service_role;
create policy employee_import_read on public.employee_imports for select to authenticated
 using(expires_at>clock_timestamp() and private.can_read_employee_import(agency_id));
create policy employee_import_row_read on public.employee_import_rows for select to authenticated
 using(exists(select 1 from public.employee_imports i where i.id=import_id and i.expires_at>clock_timestamp() and private.can_read_employee_import(i.agency_id)));
revoke all on public.employee_imports,public.employee_import_rows from anon,authenticated;
grant select on public.employee_imports,public.employee_import_rows to authenticated;
grant all on public.employee_imports,public.employee_import_rows to service_role;

create function private.classify_employee_import(p_import_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_agency uuid; v_fingerprint text;
begin
 select agency_id into strict v_agency from public.employee_imports where id=p_import_id;
 update public.employee_import_rows r set classification=case
 when excluded then 'EXCLUDED'
 when jsonb_array_length(issues)>0 or length(matricule) not between 1 and 80 or length(nom_complet) not between 1 and 160 or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'INVALID'
 when exists(select 1 from public.employee_import_rows x where x.import_id=r.import_id and not x.excluded and x.row_number<>r.row_number and (x.matricule=r.matricule or x.email=r.email)) then 'DUPLICATE'
 when exists(select 1 from public.employees e join public.employee_employment_lifecycle l on l.employee_id=e.id where e.agency_id=v_agency and e.employee_id=r.matricule and l.state='DEPARTED') then 'ARCHIVED'
 when exists(select 1 from public.employees e where e.agency_id=v_agency and e.employee_id=r.matricule and not e.is_active) then 'DISABLED'
 when exists(select 1 from public.employees e where e.agency_id=v_agency and e.employee_id=r.matricule and e.email=r.email and e.full_name=r.nom_complet) then 'IDENTICAL'
 when exists(select 1 from public.employees e where e.agency_id=v_agency and (e.employee_id=r.matricule or e.email=r.email)) or exists(select 1 from public.profiles p where p.email=r.email) then 'CONFLICT'
 else 'CREATE' end,
 employee_uuid=(select e.id from public.employees e where e.agency_id=v_agency and e.employee_id=r.matricule),
 expected_revision=(select e.revision from public.employees e where e.agency_id=v_agency and e.employee_id=r.matricule),
 expected_lifecycle_revision=(select l.revision from public.employee_employment_lifecycle l join public.employees e on e.id=l.employee_id where e.agency_id=v_agency and e.employee_id=r.matricule)
 where import_id=p_import_id;
 select encode(sha256(convert_to(jsonb_build_array(v_agency,'employee-create-v1',coalesce(jsonb_agg(jsonb_build_array(row_number,matricule,nom_complet,email,issues,excluded,classification,employee_uuid,expected_revision,expected_lifecycle_revision) order by row_number),'[]'::jsonb))::text,'UTF8')),'hex')
 into v_fingerprint from public.employee_import_rows where import_id=p_import_id;
 return v_fingerprint;
end $$;
revoke all on function private.classify_employee_import(uuid) from public,anon,authenticated;

create function public.agency_preview_employee_import(p_actor_id uuid,p_agency_id uuid,p_rows jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_row jsonb; v_hash text; v_matricule text; v_issues jsonb;
begin
 perform private.agency_require_actor(p_actor_id,p_agency_id);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'invalid_input' using errcode='22023'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'invalid_input' using errcode='22023'; end if;
 insert into public.employee_imports(agency_id,uploaded_by,reviewed_by) values(p_agency_id,p_actor_id,p_actor_id) returning id into v_id;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(v_row)<>'object' or jsonb_typeof(v_row->'row_number') is distinct from 'number' or jsonb_typeof(v_row->'matricule') is distinct from 'string' or jsonb_typeof(v_row->'nom_complet') is distinct from 'string' or jsonb_typeof(v_row->'email') is distinct from 'string' or jsonb_typeof(v_row->'issues') is distinct from 'array' or length(v_row->>'matricule')>200 or length(v_row->>'nom_complet')>512 or length(v_row->>'email')>512 then raise exception 'invalid_input' using errcode='22023'; end if;
  v_issues:=v_row->'issues';
  begin v_matricule:=private.canonical_employee_id(v_row->>'matricule');
  exception when sqlstate '22023' then v_matricule:=v_row->>'matricule'; v_issues:=v_issues || '["Le matricule doit contenir entre 1 et 80 caractères."]'::jsonb; end;
  insert into public.employee_import_rows(import_id,row_number,matricule,nom_complet,email,issues)
  values(v_id,(v_row->>'row_number')::integer,v_matricule,btrim(v_row->>'nom_complet'),lower(btrim(v_row->>'email')),v_issues);
 end loop;
 v_hash:=private.classify_employee_import(v_id);
 update public.employee_imports set fingerprint=v_hash,status=case when exists(select 1 from public.employee_import_rows where import_id=v_id and classification not in ('CREATE','IDENTICAL','EXCLUDED')) then 'INVALID' else 'READY' end where id=v_id;
 insert into public.agency_employee_events(agency_id,actor_profile_id,actor_role,action,result,employee_import_id)
 select p_agency_id,p_actor_id,p.role,'employee_import.previewed','SUCCESS',v_id from public.profiles p where p.id=p_actor_id;
 return v_id;
end $$;

create function public.agency_review_employee_import(p_actor_id uuid,p_import_id uuid,p_fingerprint text,p_excluded integer[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_import public.employee_imports; v_hash text;
begin
 select * into v_import from public.employee_imports where id=p_import_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform private.agency_require_actor(p_actor_id,v_import.agency_id);
 select * into v_import from public.employee_imports where id=p_import_id for update;
 if v_import.expires_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
 if v_import.status='COMMITTED' or v_import.fingerprint is distinct from p_fingerprint then raise exception 'stale_review' using errcode='PT409'; end if;
 update public.employee_import_rows set excluded=row_number=any(coalesce(p_excluded,'{}'::integer[])) where import_id=p_import_id;
 v_hash:=private.classify_employee_import(p_import_id);
 update public.employee_imports set fingerprint=v_hash,reviewed_by=p_actor_id,status=case when exists(select 1 from public.employee_import_rows where import_id=p_import_id and classification not in ('CREATE','IDENTICAL','EXCLUDED')) then 'INVALID' else 'READY' end where id=p_import_id;
 insert into public.agency_employee_events(agency_id,actor_profile_id,actor_role,action,result,employee_import_id)
 select v_import.agency_id,p_actor_id,p.role,'employee_import.reviewed','SUCCESS',p_import_id from public.profiles p where p.id=p_actor_id;
end $$;

create function public.agency_commit_employee_import(p_actor_id uuid,p_import_id uuid,p_fingerprint text) returns integer
language plpgsql security definer set search_path='' as $$
declare v_import public.employee_imports; v_hash text; v_row record; v_count integer:=0; v_employee uuid;
begin
 -- Match agency_create_employee before any actor/import/employee row lock.
 -- Re-entrant CREATE calls must never upgrade a weaker profiles table lock.
 lock table public.profiles in share row exclusive mode;
 select * into v_import from public.employee_imports where id=p_import_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform private.agency_require_actor(p_actor_id,v_import.agency_id);
 select * into v_import from public.employee_imports where id=p_import_id for update;
 if v_import.expires_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
 if v_import.fingerprint is distinct from p_fingerprint then raise exception 'stale_review' using errcode='PT409'; end if;
 if v_import.status='COMMITTED' then return v_import.created_count; end if;
 -- Covers absent identities too; concurrent payroll/create/update must finish before revalidation.
 -- Bounded to 1000 rows and no I/O/email inside this transaction.
 lock table public.employees in share row exclusive mode;
 perform e.id from public.employees e where e.agency_id=v_import.agency_id order by e.id for update;
 perform l.employee_id from public.employee_employment_lifecycle l where l.agency_id=v_import.agency_id order by l.employee_id for update;
 v_hash:=private.classify_employee_import(p_import_id);
 if v_hash is distinct from p_fingerprint then raise exception 'stale_review' using errcode='PT409'; end if;
 if exists(select 1 from public.employee_import_rows where import_id=p_import_id and classification not in ('CREATE','IDENTICAL','EXCLUDED')) then raise exception 'invalid_rows' using errcode='22023'; end if;
 for v_row in select * from public.employee_import_rows where import_id=p_import_id and classification='CREATE' order by matricule loop
  v_employee:=public.agency_create_employee(p_actor_id,v_import.agency_id,v_row.matricule,v_row.email,v_row.nom_complet);
  v_count:=v_count+1;
 end loop;
 insert into public.agency_employee_events(employee_id,agency_id,actor_profile_id,actor_role,action,result,employee_import_id,employee_import_created_count)
 select null,v_import.agency_id,p_actor_id,p.role,'employee_import.committed','SUCCESS',p_import_id,v_count from public.profiles p where p.id=p_actor_id;
 update public.employee_imports set status='COMMITTED',committed_by=p_actor_id,committed_at=clock_timestamp(),created_count=v_count where id=p_import_id;
 return v_count;
end $$;
revoke all on function public.agency_preview_employee_import(uuid,uuid,jsonb),public.agency_review_employee_import(uuid,uuid,text,integer[]),public.agency_commit_employee_import(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_preview_employee_import(uuid,uuid,jsonb),public.agency_review_employee_import(uuid,uuid,text,integer[]),public.agency_commit_employee_import(uuid,uuid,text) to service_role;

create function private.purge_employee_imports() returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin delete from public.employee_imports where expires_at<=clock_timestamp(); get diagnostics v_count=row_count; return v_count; end $$;
revoke all on function private.purge_employee_imports() from public,anon,authenticated;
select cron.schedule('employee-import-retention-30-days','17 * * * *',$job$set statement_timeout='120s'; set lock_timeout='5s'; select private.purge_employee_imports();$job$);
