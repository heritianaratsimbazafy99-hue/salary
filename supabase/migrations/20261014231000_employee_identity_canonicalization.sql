begin;

-- One matricule contract for RH, payroll and invitations: ECMAScript boundary
-- whitespace removed, ASCII letters uppercased, other Unicode preserved, 1..80
-- code points. Non-ASCII case remains significant (no ß->SS/NFC conversion).
-- Never merge identities: abort the complete migration before touching data.
create function private.canonical_employee_id(value text) returns text
language plpgsql immutable strict security invoker set search_path = '' as $$
declare result text := translate(btrim(value, E' \t\n\r' || chr(11) || chr(12) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
begin
  if length(result) not between 1 and 80 then
    raise exception 'invalid_employee_matricule: expected 1..80 characters' using errcode = '22023';
  end if;
  return result;
end $$;
revoke all on function private.canonical_employee_id(text) from public, anon;
grant execute on function private.canonical_employee_id(text) to authenticated, service_role;

-- Lock writers before checking: no concurrent insertion can evade preflight.
lock table public.employees, public.employee_invitations, public.payroll_imports, public.payroll_import_rows in share row exclusive mode;
do $$ begin
  perform private.canonical_employee_id(employee_id) from public.employees;
  perform private.canonical_employee_id(employee_id) from public.employee_invitations;
  perform private.canonical_employee_id(r.employee_id) from public.payroll_import_rows r join public.payroll_imports i on i.id=r.import_id where i.status not in ('PUBLISHED','SUPERSEDED');
  if exists(select 1 from public.employees group by agency_id, private.canonical_employee_id(employee_id) having count(*) > 1) then
    raise exception 'employee_matricule_collision: manual identity review required' using errcode = '23505';
  end if;
  if exists(select 1 from public.employee_invitations group by agency_id, private.canonical_employee_id(employee_id), status having count(*) > 1) then
    raise exception 'invitation_matricule_collision: manual identity review required' using errcode = '23505';
  end if;
  if exists(select 1 from public.payroll_import_rows r join public.payroll_imports i on i.id=r.import_id where i.status not in ('PUBLISHED','SUPERSEDED') group by r.import_id, private.canonical_employee_id(r.employee_id) having count(*) > 1) then
    raise exception 'import_matricule_collision: correct the unpublished import first' using errcode = '23505';
  end if;
end $$;

-- Only business keys change. UUIDs, profiles, sessions and every UUID relation stay.
update public.employees set employee_id=private.canonical_employee_id(employee_id) where employee_id is distinct from private.canonical_employee_id(employee_id);
update public.employee_invitations set employee_id=private.canonical_employee_id(employee_id) where employee_id is distinct from private.canonical_employee_id(employee_id);
-- Published source rows and payslip snapshots remain immutable historical evidence.
update public.payroll_import_rows r set employee_id=private.canonical_employee_id(r.employee_id),
  normalized_data=jsonb_set(r.normalized_data, '{employeeId}', to_jsonb(private.canonical_employee_id(r.employee_id)))
from public.payroll_imports i where i.id=r.import_id and i.status not in ('PUBLISHED','SUPERSEDED')
  and (r.employee_id is distinct from private.canonical_employee_id(r.employee_id) or r.normalized_data->>'employeeId' is distinct from private.canonical_employee_id(r.employee_id));
update public.payroll_imports i set unknown_employee_count=(select count(distinct r.employee_id) from public.payroll_import_rows r where r.import_id=i.id and not exists(select 1 from public.employees e where e.agency_id=i.agency_id and e.employee_id=r.employee_id)), updated_at=clock_timestamp()
where i.status not in ('PUBLISHED','SUPERSEDED');

create function private.normalize_employee_matricule() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.employee_id := private.canonical_employee_id(new.employee_id);
  if tg_table_name = 'payroll_import_rows' then
    new.normalized_data := jsonb_set(new.normalized_data, '{employeeId}', to_jsonb(new.employee_id));
  end if;
  return new;
end $$;
revoke all on function private.normalize_employee_matricule() from public, anon, authenticated, service_role;
create trigger normalize_employee_matricule before insert or update of employee_id on public.employees for each row execute function private.normalize_employee_matricule();
create trigger normalize_employee_matricule before insert or update of employee_id on public.employee_invitations for each row execute function private.normalize_employee_matricule();
create trigger normalize_employee_matricule before insert or update on public.payroll_import_rows for each row execute function private.normalize_employee_matricule();
alter table public.employees add constraint employees_canonical_matricule check (employee_id = private.canonical_employee_id(employee_id));
alter table public.employee_invitations add constraint invitations_canonical_matricule check (employee_id = private.canonical_employee_id(employee_id));

create or replace function public.publish_payroll_import(
  p_import_id uuid,
  p_actor_profile_id uuid,
  p_actor_agency_id uuid
)
returns table (
  import_id uuid,
  agency_id uuid,
  period_start date,
  period_end date,
  published_count integer,
  status public.import_status
)
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_actor_role public.app_role;
  v_employee record;
  v_import record;
  v_payslip record;
  v_published_count integer := 0;
  v_row record;
  v_version_id uuid;
  v_version_number integer;
begin
  select p.role
    into v_actor_role
  from public.profiles p
  where p.id = p_actor_profile_id and p.is_active
  for share;

  if v_actor_role is distinct from 'agency_manager'::public.app_role then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  perform 1 from public.agency_memberships am join public.agencies a on a.id = am.agency_id
  where am.profile_id = p_actor_profile_id and am.agency_id = p_actor_agency_id and a.is_active
  for share of am, a;
  if not found then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  select pi.id, pi.agency_id, pi.period_start, pi.period_end, pi.status, pi.created_at
    into v_import
  from public.payroll_imports pi
  where pi.id = p_import_id
  for update;

  if not found then
    raise exception 'Import introuvable.' using errcode = 'P0002';
  end if;

  if v_import.agency_id <> p_actor_agency_id then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  if v_import.created_at + interval '1 year' <= now() then
    raise exception 'Import expiré.' using errcode = '42501';
  end if;

  if v_import.status <> 'READY_FOR_PREVIEW'::public.import_status then
    raise exception 'Import is not ready for publication.' using errcode = 'P0001';
  end if;

  for v_row in
    select pir.employee_email,
           pir.employee_id,
           pir.employee_name,
           pir.normalized_data,
           pir.pay_items
    from public.payroll_import_rows pir
    where pir.import_id = p_import_id
      and pir.agency_id = v_import.agency_id
    order by pir.employee_id
    for update
  loop
    perform 1 from public.employees e where e.agency_id = v_import.agency_id and e.employee_id = v_row.employee_id for update;
    if exists (select 1 from public.employees e where e.agency_id = v_import.agency_id and e.employee_id = v_row.employee_id and not e.is_active) then
      raise exception 'Un salarié est désactivé. Réactivation RH nécessaire.' using errcode = 'PT409';
    end if;

    if exists (select 1 from public.employees e where e.agency_id = v_import.agency_id and
      ((e.employee_id = v_row.employee_id and lower(e.email) <> lower(v_row.employee_email)) or
       (e.employee_id <> v_row.employee_id and lower(e.email) = lower(v_row.employee_email)))) then
      raise exception 'Conflit d’identité pour le matricule %. Vérifiez le dossier RH et l’email avant de réimporter.', v_row.employee_id using errcode = 'PT422';
    end if;

    insert into public.employees (
      agency_id,
      email,
      employee_id,
      full_name,
      is_active
    )
    values (
      v_import.agency_id,
      lower(v_row.employee_email),
      v_row.employee_id,
      v_row.employee_name,
      true
    )
    on conflict on constraint employees_agency_id_employee_id_key do update
      set full_name = excluded.full_name
    returning id, profile_id, email, is_active
      into v_employee;

    -- A previously absent employee can be inserted concurrently while the
    -- preflight SELECT sees no row. ON CONFLICT locks the winning row; validate
    -- that returned state too so a concurrent disabled employee cannot publish.
    if lower(v_employee.email) <> lower(v_row.employee_email) then
      raise exception 'L’identité du salarié a changé. Vérifiez le dossier RH.' using errcode = 'PT422';
    end if;
    if not v_employee.is_active then
      raise exception 'Un salarié est désactivé. Réactivation RH nécessaire.' using errcode = 'PT409';
    end if;

    select p.id, p.current_version_id
      into v_payslip
    from public.payslips p
    where p.agency_id = v_import.agency_id
      and p.employee_id = v_employee.id
      and p.period_start = v_import.period_start
      and p.period_end = v_import.period_end
    for update;

    if not found then
      insert into public.payslips (
        agency_id,
        employee_id,
        period_end,
        period_start,
        published_by
      )
      values (
        v_import.agency_id,
        v_employee.id,
        v_import.period_end,
        v_import.period_start,
        p_actor_profile_id
      )
      returning id, current_version_id
        into v_payslip;
    end if;

    if v_payslip.current_version_id is not null then
      update public.payslip_versions
      set replaced_at = now()
      where id = v_payslip.current_version_id
        and payslip_id = v_payslip.id
        and replaced_at is null;
    end if;

    select coalesce(max(pv.version_number), 0) + 1
      into v_version_number
    from public.payslip_versions pv
    where pv.payslip_id = v_payslip.id;

    insert into public.payslip_versions (
      agency_id,
      import_id,
      pay_items,
      payslip_id,
      published_by,
      snapshot_data,
      version_number
    )
    values (
      v_import.agency_id,
      p_import_id,
      coalesce(v_row.pay_items, '[]'::jsonb),
      v_payslip.id,
      p_actor_profile_id,
      v_row.normalized_data,
      v_version_number
    )
    returning id
      into v_version_id;

    update public.payslips
    set current_version_id = v_version_id,
        published_at = now(),
        published_by = p_actor_profile_id
    where public.payslips.id = v_payslip.id
      and public.payslips.agency_id = v_import.agency_id;

    insert into public.notifications (
      notification_type,
      recipient_email,
      recipient_profile_id,
      resource_id,
      resource_type,
      status
    )
    values (
      'PAYSLIP_PUBLISHED',
      lower(v_employee.email),
      v_employee.profile_id,
      v_payslip.id,
      'payslip',
      'PENDING'
    );

    v_published_count := v_published_count + 1;
  end loop;

  update public.payroll_imports
  set status = 'PUBLISHED'::public.import_status
  where public.payroll_imports.id = p_import_id
    and public.payroll_imports.agency_id = v_import.agency_id
    and public.payroll_imports.status = 'READY_FOR_PREVIEW'::public.import_status;

  return query
  select v_import.id,
         v_import.agency_id,
         v_import.period_start,
         v_import.period_end,
         v_published_count,
         'PUBLISHED'::public.import_status;
exception when unique_violation then
  -- A competing publication may claim the same email after the preflight read.
  raise exception 'Conflit de matricule ou d’email. Vérifiez les dossiers RH avant de réimporter.' using errcode = 'PT422';
end;
$$;

revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from public;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from anon;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from authenticated;
grant execute on function public.publish_payroll_import(uuid, uuid, uuid) to service_role;


create or replace function public.hr_create_employee(p_actor_id uuid, p_agency_id uuid, p_matricule text, p_email text, p_full_name text,
  p_job_title text, p_department_id uuid, p_site_id uuid, p_team_id uuid, p_manager_profile_id uuid,
  p_status public.hr_employee_status, p_contract_type public.hr_contract_type, p_contract_start date, p_contract_end date)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare v_actor public.profiles := private.hr_require_hr_actor(p_actor_id); v_id uuid;
begin
  if p_matricule is null or length(private.canonical_employee_id(p_matricule)) not between 1 and 80 or p_full_name is null or length(btrim(p_full_name)) not between 1 and 160
    or p_email is null or length(btrim(p_email)) > 254 or position('@' in btrim(p_email)) < 2 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform 1 from public.agencies where id = p_agency_id and is_active for share;
  if not found then raise exception 'inactive_agency' using errcode = '22023'; end if;
  perform private.hr_validate_record(p_agency_id, p_job_title, p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
  insert into public.employees(agency_id, employee_id, email, full_name, is_active)
  values(p_agency_id, btrim(p_matricule), lower(btrim(p_email)), btrim(p_full_name), true) returning id into v_id;
  insert into public.employee_hr_records(employee_id, agency_id, job_title, department_id, site_id, team_id, manager_profile_id, status, contract_type, contract_start, contract_end)
  values(v_id, p_agency_id, btrim(p_job_title), p_department_id, p_site_id, p_team_id, p_manager_profile_id, p_status, p_contract_type, p_contract_start, p_contract_end);
  insert into public.employee_private_details(employee_id, agency_id) values(v_id, p_agency_id);
  insert into public.audit_logs(actor_profile_id, actor_role, agency_id, employee_id, action, resource_type, resource_id, metadata)
  values(v_actor.id, v_actor.role, p_agency_id, v_id, 'hr_employee.created', 'employee', v_id,
    jsonb_build_object('status', p_status, 'contract_type', p_contract_type, 'site_id', p_site_id, 'department_id', p_department_id));
  return v_id;
end $$;

create or replace function public.review_payroll_import(p_import_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare conflicting_id text;
begin
  select r.employee_id into conflicting_id from public.payroll_import_rows r
  join public.payroll_imports i on i.id=r.import_id
  where i.id=p_import_id and exists(select 1 from public.employees e where e.agency_id=i.agency_id and
    ((e.employee_id=r.employee_id and lower(e.email)<>lower(r.employee_email)) or
     (e.employee_id<>r.employee_id and lower(e.email)=lower(r.employee_email)))) limit 1;
  if found then
    raise exception 'Conflit d’identité pour le matricule %. Vérifiez le dossier RH et l’email avant de réimporter.', conflicting_id using errcode = 'PT422';
  end if;
  return (select jsonb_build_object(
    'fingerprint', md5(to_jsonb(pi)::text || coalesce((select jsonb_agg(to_jsonb(r) order by r.id)::text from public.payroll_import_rows r where r.import_id = pi.id), '[]')),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('employeeId', r.employee_id, 'employeeName', r.employee_name, 'email', r.employee_email) order by r.employee_name, r.id) from public.payroll_import_rows r where r.import_id = pi.id), '[]'::jsonb)
  ) from public.payroll_imports pi where pi.id = p_import_id);
end;
$$;

commit;
