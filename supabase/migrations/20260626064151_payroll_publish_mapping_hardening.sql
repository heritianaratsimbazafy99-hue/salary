alter table public.payroll_import_rows
  add column raw_unknown_columns jsonb not null default '{}'::jsonb,
  add constraint payroll_import_rows_raw_unknown_columns_object
    check (jsonb_typeof(raw_unknown_columns) = 'object');

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
  where p.id = p_actor_profile_id;

  if v_actor_role is distinct from 'agency_manager'::public.app_role then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.agency_memberships am
    where am.profile_id = p_actor_profile_id
      and am.agency_id = p_actor_agency_id
  ) then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;

  select pi.id, pi.agency_id, pi.period_start, pi.period_end, pi.status
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
      set email = excluded.email,
          full_name = excluded.full_name,
          is_active = true
    returning id, profile_id, email
      into v_employee;

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
end;
$$;

revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from public;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from anon;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from authenticated;
grant execute on function public.publish_payroll_import(uuid, uuid, uuid) to service_role;
