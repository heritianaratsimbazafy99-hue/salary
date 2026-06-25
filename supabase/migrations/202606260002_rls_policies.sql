alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.agency_memberships enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_imports enable row level security;
alter table public.payroll_import_rows enable row level security;
alter table public.payroll_import_errors enable row level security;
alter table public.column_mappings enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_versions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.export_jobs enable row level security;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
revoke all on sequences from anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select, insert, update on table public.agencies to authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.agency_memberships to authenticated;
grant select, insert on table public.employees to authenticated;
grant select, insert, update on table public.payroll_imports to authenticated;
grant select, insert, update on table public.payroll_import_rows to authenticated;
grant select, insert on table public.payroll_import_errors to authenticated;
grant select, insert, update on table public.column_mappings to authenticated;
grant select, insert on table public.payslips to authenticated;
grant select, insert on table public.payslip_versions to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.export_jobs to authenticated;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
$$;

create or replace function public.current_agency_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select am.agency_id
  from public.agency_memberships am
  where am.profile_id = public.current_profile_id()
$$;

create or replace function public.is_global_reader()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.current_app_role() in ('hr_central', 'super_admin')
$$;

revoke execute on function public.current_profile_id() from public;
revoke execute on function public.current_app_role() from public;
revoke execute on function public.current_agency_id() from public;
revoke execute on function public.is_global_reader() from public;

grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.current_agency_id() to authenticated, service_role;
grant execute on function public.is_global_reader() to authenticated, service_role;

create policy agencies_select_scoped on public.agencies
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and id = public.current_agency_id()
  )
);

create policy agencies_insert_global_admin on public.agencies
for insert to authenticated
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy agencies_update_global_admin on public.agencies
for update to authenticated
using (public.current_app_role() in ('hr_central', 'super_admin'))
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy profiles_select_self_or_global on public.profiles
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or public.is_global_reader()
);

create policy memberships_select_scoped on public.agency_memberships
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_global_reader()
);

create policy memberships_insert_global_admin on public.agency_memberships
for insert to authenticated
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy memberships_update_global_admin on public.agency_memberships
for update to authenticated
using (public.current_app_role() in ('hr_central', 'super_admin'))
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy memberships_delete_global_admin on public.agency_memberships
for delete to authenticated
using (public.current_app_role() in ('hr_central', 'super_admin'));

create policy employees_select_scoped on public.employees
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
  or (
    public.current_app_role() = 'employee'
    and profile_id = public.current_profile_id()
  )
);

create policy employees_insert_manager_or_admin on public.employees
for insert to authenticated
with check (
  (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
  or public.current_app_role() = 'super_admin'
);

create policy imports_select_scoped on public.payroll_imports
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
);

create policy imports_insert_manager on public.payroll_imports
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and uploaded_by = public.current_profile_id()
);

create policy imports_update_manager on public.payroll_imports
for update to authenticated
using (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
)
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
);

create policy import_rows_select_scoped on public.payroll_import_rows
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
);

create policy import_rows_insert_manager on public.payroll_import_rows
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and exists (
    select 1
    from public.payroll_imports pi
    where pi.id = payroll_import_rows.import_id
      and pi.agency_id = payroll_import_rows.agency_id
      and pi.uploaded_by = public.current_profile_id()
  )
);

create policy import_rows_update_manager on public.payroll_import_rows
for update to authenticated
using (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and exists (
    select 1
    from public.payroll_imports pi
    where pi.id = payroll_import_rows.import_id
      and pi.agency_id = payroll_import_rows.agency_id
      and pi.uploaded_by = public.current_profile_id()
  )
)
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and exists (
    select 1
    from public.payroll_imports pi
    where pi.id = payroll_import_rows.import_id
      and pi.agency_id = payroll_import_rows.agency_id
      and pi.uploaded_by = public.current_profile_id()
  )
);

create policy import_errors_select_scoped on public.payroll_import_errors
for select to authenticated
using (
  exists (
    select 1
    from public.payroll_imports pi
    where pi.id = payroll_import_errors.import_id
      and (
        public.is_global_reader()
        or (
          public.current_app_role() = 'agency_manager'
          and pi.agency_id = public.current_agency_id()
        )
      )
  )
);

create policy import_errors_insert_manager on public.payroll_import_errors
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and exists (
    select 1
    from public.payroll_imports pi
    where pi.id = payroll_import_errors.import_id
      and pi.agency_id = public.current_agency_id()
      and pi.uploaded_by = public.current_profile_id()
  )
);

create policy mappings_select_scoped on public.column_mappings
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
);

create policy mappings_insert_manager on public.column_mappings
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and created_by = public.current_profile_id()
);

create policy mappings_update_manager on public.column_mappings
for update to authenticated
using (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
)
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and created_by = public.current_profile_id()
);

create policy payslips_select_scoped on public.payslips
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
  )
  or (
    public.current_app_role() = 'employee'
    and current_version_id is not null
    and (expires_at is null or expires_at > now())
    and exists (
      select 1
      from public.employees e
      where e.id = payslips.employee_id
        and e.profile_id = public.current_profile_id()
    )
  )
);

create policy payslips_insert_manager on public.payslips
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and published_by = public.current_profile_id()
  and exists (
    select 1
    from public.employees e
    where e.id = payslips.employee_id
      and e.agency_id = payslips.agency_id
  )
);

create policy payslip_versions_select_scoped on public.payslip_versions
for select to authenticated
using (
  exists (
    select 1
    from public.payslips p
    join public.employees e on e.id = p.employee_id
    where p.id = payslip_versions.payslip_id
      and p.agency_id = payslip_versions.agency_id
      and (
        public.is_global_reader()
        or (
          public.current_app_role() = 'agency_manager'
          and p.agency_id = public.current_agency_id()
        )
        or (
          public.current_app_role() = 'employee'
          and p.current_version_id = payslip_versions.id
          and (p.expires_at is null or p.expires_at > now())
          and e.profile_id = public.current_profile_id()
        )
      )
  )
);

create policy payslip_versions_insert_manager on public.payslip_versions
for insert to authenticated
with check (
  public.current_app_role() = 'agency_manager'
  and agency_id = public.current_agency_id()
  and published_by = public.current_profile_id()
  and exists (
    select 1
    from public.payslips p
    join public.payroll_imports pi
      on pi.id = payslip_versions.import_id
      and pi.agency_id = payslip_versions.agency_id
    where p.id = payslip_versions.payslip_id
      and p.agency_id = payslip_versions.agency_id
      and p.agency_id = public.current_agency_id()
  )
);

create policy audit_select_global on public.audit_logs
for select to authenticated
using (public.is_global_reader());

create policy notifications_select_recipient_or_global on public.notifications
for select to authenticated
using (
  public.is_global_reader()
  or recipient_profile_id = public.current_profile_id()
);

create policy exports_select_authorized on public.export_jobs
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
    and export_type = 'IMPORT_REPORT'
  )
);
