-- Preserve the live access predicates and all existing function privileges.
-- SQL SECURITY DEFINER helpers repeatedly plan nested queries under concurrent
-- RLS reads. PL/pgSQL retains internal plans per database connection, while STABLE
-- reads the current statement snapshot (never a cached user/role decision).
-- A subsequent statement therefore still sees deactivation or reassignment.

create or replace function private.current_profile_id()
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
 return (select p.id from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.is_active
    and (p.role <> 'employee' or not exists (
      select 1 from public.employees e where e.profile_id = p.id
    ) or exists (
      select 1 from public.employees e join public.agencies a on a.id = e.agency_id
      where e.profile_id = p.id and e.is_active and a.is_active
    ))
    and (p.role <> 'agency_manager' or exists (
      select 1 from public.agency_memberships m join public.agencies a on a.id = m.agency_id
      where m.profile_id = p.id and a.is_active
    )));
end $fn$;
create or replace function private.current_app_role()
returns public.app_role language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin return (select p.role from public.profiles p where p.id = (select private.current_profile_id())); end $fn$;
create or replace function private.current_agency_id()
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin return (select m.agency_id from public.agency_memberships m join public.agencies a on a.id = m.agency_id
  where m.profile_id = (select private.current_profile_id()) and a.is_active); end $fn$;
create or replace function private.is_global_reader()
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin return private.current_app_role() in ('hr_central','super_admin'); end $fn$;
create or replace function private.employee_access_active(p_employee_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin return exists(select 1 from public.employees e join public.agencies a on a.id = e.agency_id
    where e.id = p_employee_id and e.profile_id = (select private.current_profile_id()) and e.is_active and a.is_active); end $fn$;

-- Cache only zero-argument actor helpers for one statement. Row-dependent
-- employee_access_active(id) remains evaluated for the actual employment.
-- Policy roles, permissive/restrictive modes, write checks and retention stay intact.

alter policy profiles_select_self_or_global on public.profiles
using (((id = (select private.current_profile_id())) OR (select private.is_global_reader())));

alter policy payslips_active_employee on public.payslips
using ((((select private.current_app_role()) <> 'employee'::app_role) OR private.employee_access_active(employee_id)));

alter policy payslips_select_scoped on public.payslips
using (((select private.is_global_reader()) OR (((select private.current_app_role()) = 'agency_manager'::app_role) AND (agency_id = (select private.current_agency_id()))) OR (((select private.current_app_role()) = 'employee'::app_role) AND (current_version_id IS NOT NULL) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = payslips.employee_id) AND (e.profile_id = (select private.current_profile_id()))))))));

alter policy payslip_versions_select_scoped on public.payslip_versions
using ((EXISTS ( SELECT 1
   FROM (payslips p
     JOIN employees e ON ((e.id = p.employee_id)))
  WHERE ((p.id = payslip_versions.payslip_id) AND (p.agency_id = payslip_versions.agency_id) AND ((select private.is_global_reader()) OR (((select private.current_app_role()) = 'agency_manager'::app_role) AND (p.agency_id = (select private.current_agency_id()))) OR (((select private.current_app_role()) = 'employee'::app_role) AND (p.current_version_id = payslip_versions.id) AND ((p.expires_at IS NULL) OR (p.expires_at > now())) AND (e.profile_id = (select private.current_profile_id()))))))));

alter policy employees_active_self on public.employees
using ((((select private.current_app_role()) <> 'employee'::app_role) OR private.employee_access_active(id)));

alter policy employees_select_scoped on public.employees
using (((select private.is_global_reader()) OR (((select private.current_app_role()) = 'agency_manager'::app_role) AND (agency_id = (select private.current_agency_id()))) OR (((select private.current_app_role()) = 'employee'::app_role) AND (profile_id = (select private.current_profile_id())))));
