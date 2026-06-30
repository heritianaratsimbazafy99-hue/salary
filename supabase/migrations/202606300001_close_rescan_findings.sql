-- Close residual Codex Security rescan findings.
-- Employee/profile binding and payslip publication rows are server-owned. Authenticated
-- clients keep read access through RLS, but mutations must go through API routes/RPCs
-- after application authorization checks pass.

revoke insert on table public.employees from authenticated;
revoke insert on table public.payslips from authenticated;
revoke insert on table public.payslip_versions from authenticated;

drop policy if exists employees_insert_manager_or_admin on public.employees;
drop policy if exists payslips_insert_manager on public.payslips;
drop policy if exists payslip_versions_insert_manager on public.payslip_versions;

update public.payslips
set expires_at = null
where current_version_id is null;

comment on table public.employees is
  'Employee profile binding is server-owned. Authenticated clients may not insert employee records directly.';

comment on table public.payslips is
  'Published payslip rows are server-owned. Authenticated clients may not insert payslip records directly.';

comment on table public.payslip_versions is
  'Published payslip versions are server-owned. Authenticated clients may not insert version records directly.';
