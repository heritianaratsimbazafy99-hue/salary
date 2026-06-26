create view public.payroll_analytics_rows
with (security_invoker = true)
as
select
  p.agency_id,
  a.name as agency_name,
  e.employee_id,
  e.full_name as employee_name,
  p.period_start,
  p.period_end,
  (pv.snapshot_data ->> 'grossAmount')::numeric as gross_amount,
  (pv.snapshot_data ->> 'deductionsTotal')::numeric as deductions_total,
  (pv.snapshot_data ->> 'netAmount')::numeric as net_amount,
  pv.published_at
from public.payslips p
join public.payslip_versions pv on pv.id = p.current_version_id
join public.employees e on e.id = p.employee_id
join public.agencies a on a.id = p.agency_id
where private.is_global_reader();

revoke all on table public.payroll_analytics_rows from public, anon, authenticated;
grant select on table public.payroll_analytics_rows to authenticated, service_role;
