-- Business conflicts use PT409 (HTTP 409), never retryable serialization SQLSTATE 40001.
-- Keep the legacy server RPC safe throughout the rolling deployment.
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
          full_name = excluded.full_name
    returning id, profile_id, email, is_active
      into v_employee;

    -- A previously absent employee can be inserted concurrently while the
    -- preflight SELECT sees no row. ON CONFLICT locks the winning row; validate
    -- that returned state too so a concurrent disabled employee cannot publish.
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
end;
$$;

revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from public;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from anon;
revoke execute on function public.publish_payroll_import(uuid, uuid, uuid) from authenticated;
grant execute on function public.publish_payroll_import(uuid, uuid, uuid) to service_role;

-- Review is read through the caller's RLS; the hash covers the complete import,
-- including every row and mapped item, independently of API pagination limits.
create function public.review_payroll_import(p_import_id uuid)
returns jsonb language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'fingerprint', md5(to_jsonb(pi)::text || coalesce((select jsonb_agg(to_jsonb(r) order by r.id)::text from public.payroll_import_rows r where r.import_id = pi.id), '[]')),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('employeeId', r.employee_id, 'employeeName', r.employee_name, 'email', r.employee_email) order by r.employee_name, r.id) from public.payroll_import_rows r where r.import_id = pi.id), '[]'::jsonb)
  ) from public.payroll_imports pi where pi.id = p_import_id;
$$;
revoke all on function public.review_payroll_import(uuid) from public, anon;
grant execute on function public.review_payroll_import(uuid) to authenticated, service_role;

-- New endpoint preserves the previous publication RPC for rolling deployments.
create function public.publish_payroll_import_reviewed(p_import_id uuid, p_actor_profile_id uuid, p_actor_agency_id uuid, p_fingerprint text)
returns table (import_id uuid, agency_id uuid, period_start date, period_end date, published_count integer, status public.import_status)
language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
begin
  perform 1 from public.profiles p join public.agency_memberships m on m.profile_id = p.id
    where p.id = p_actor_profile_id and p.is_active and p.role = 'agency_manager' and m.agency_id = p_actor_agency_id for share of p, m;
  if not found then raise exception 'Action non autorisee.' using errcode = '42501'; end if;
  perform 1 from public.payroll_imports where id = p_import_id for update;
  perform 1 from public.employees e join public.payroll_import_rows r on r.agency_id = e.agency_id and r.employee_id = e.employee_id where r.import_id = p_import_id for update of e;
  if exists (select 1 from public.employees e join public.payroll_import_rows r on r.agency_id = e.agency_id and r.employee_id = e.employee_id where r.import_id = p_import_id and not e.is_active) then
    raise exception 'Un salarié est désactivé. Réactivation RH nécessaire.' using errcode = 'PT409';
  end if;
  perform 1 from public.agencies where id = p_actor_agency_id and is_active for share;
  if not found then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;
  if p_fingerprint is null or p_fingerprint is distinct from public.review_payroll_import(p_import_id)->>'fingerprint' then
    raise exception 'La revue est périmée. Rechargez les destinataires.' using errcode = 'PT409';
  end if;
  return query select * from public.publish_payroll_import(p_import_id, p_actor_profile_id, p_actor_agency_id);
end;
$$;
revoke all on function public.publish_payroll_import_reviewed(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_payroll_import_reviewed(uuid, uuid, uuid, text) to service_role;

-- Correction, comparison with the viewed revision, and audit commit together.
-- Direct table mutations remain unavailable to authenticated clients.
create function public.adjust_payroll_import_row(p_import_id uuid, p_row_id uuid, p_actor_profile_id uuid, p_actor_agency_id uuid, p_expected_updated_at timestamptz, p_changes jsonb, p_reason text)
returns void language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
declare v_import public.payroll_imports; v_row public.payroll_import_rows; v_data jsonb; v_diff jsonb := '{}'::jsonb; v_key text;
begin
  perform 1 from public.profiles p join public.agency_memberships m on m.profile_id = p.id join public.agencies a on a.id = m.agency_id where p.id = p_actor_profile_id and p.is_active and p.role = 'agency_manager' and m.agency_id = p_actor_agency_id and a.is_active for share of p, m, a;
  if not found then
    raise exception 'Action non autorisee.' using errcode = '42501';
  end if;
  select * into v_import from public.payroll_imports where id = p_import_id and agency_id = p_actor_agency_id for update;
  if not found then raise exception 'Import introuvable.' using errcode = 'P0002'; end if;
  if v_import.created_at + interval '1 year' <= now() then raise exception 'Import expiré.' using errcode = '42501'; end if;
  if v_import.status <> 'READY_FOR_PREVIEW' then raise exception 'Import non modifiable.' using errcode = 'PT409'; end if;
  select * into v_row from public.payroll_import_rows where id = p_row_id and import_id = p_import_id and agency_id = p_actor_agency_id for update;
  if not found then raise exception 'Ligne introuvable.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or v_row.updated_at <> p_expected_updated_at then raise exception 'La ligne a changé.' using errcode = 'PT409'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb or p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500 then raise exception 'Correction invalide.' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('grossAmount', 'deductionsTotal', 'netAmount', 'notes') then raise exception 'Champ non modifiable.' using errcode = '22023'; end if;
    if v_key = 'notes' then
      if jsonb_typeof(p_changes->v_key) <> 'string' or length(p_changes->>v_key) > 1000 then raise exception 'Note invalide.' using errcode = '22023'; end if;
    elsif jsonb_typeof(p_changes->v_key) <> 'number' or abs((p_changes->>v_key)::numeric) > 999999999999 or (v_key <> 'netAmount' and (p_changes->>v_key)::numeric < 0) then
      raise exception 'Montant invalide.' using errcode = '22023';
    end if;
    if v_row.normalized_data->v_key is distinct from p_changes->v_key then
      v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('before', coalesce(v_row.manual_adjustments->v_key->'before', v_row.normalized_data->v_key), 'after', p_changes->v_key));
    end if;
  end loop;
  if v_diff = '{}'::jsonb then return; end if;
  v_data := v_row.normalized_data || p_changes;
  update public.payroll_import_rows set normalized_data = v_data, manual_adjustments = manual_adjustments || v_diff, has_manual_adjustments = true, updated_at = clock_timestamp() where id = p_row_id;
  update public.payroll_imports set updated_at = clock_timestamp() where id = p_import_id;
  insert into public.audit_logs (actor_profile_id, actor_role, agency_id, action, resource_type, resource_id, metadata)
  values (p_actor_profile_id, 'agency_manager', p_actor_agency_id, 'PAYROLL_ROW_ADJUSTED', 'payroll_import_row', p_row_id, jsonb_build_object('importId', p_import_id, 'reason', btrim(p_reason), 'changedFields', (select jsonb_agg(k) from jsonb_object_keys(v_diff) k)));
end;
$$;
revoke all on function public.adjust_payroll_import_row(uuid, uuid, uuid, uuid, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.adjust_payroll_import_row(uuid, uuid, uuid, uuid, timestamptz, jsonb, text) to service_role;

create function private.guard_payroll_row_update() returns trigger language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
declare v_status public.import_status;
begin
  select status into v_status from public.payroll_imports where id = new.import_id for update;
  if v_status in ('PUBLISHED', 'SUPERSEDED') or (tg_op = 'UPDATE' and (new.import_id <> old.import_id or new.agency_id <> old.agency_id)) then
    raise exception 'Une fiche publiée est immuable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_payroll_row_update before insert or update on public.payroll_import_rows for each row execute function private.guard_payroll_row_update();

-- Publication may replace a version once, but never edit its salary snapshot.
create function private.guard_payslip_version_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (to_jsonb(new) - 'replaced_at') is distinct from (to_jsonb(old) - 'replaced_at')
    or (old.replaced_at is not null and new.replaced_at is distinct from old.replaced_at) then
    raise exception 'Une fiche publiée est immuable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_payroll_row_update() from public, anon, authenticated, service_role;
revoke all on function private.guard_payslip_version_update() from public, anon, authenticated, service_role;
create trigger guard_payslip_version_update before update on public.payslip_versions
for each row execute function private.guard_payslip_version_update();
