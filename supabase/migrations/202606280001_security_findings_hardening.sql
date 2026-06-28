-- Security hardening for Codex Security DSS-CAND-001.
-- Import rows and import workflow state are server-owned. Authenticated users may read
-- through RLS, but API routes/RPCs must perform mutations with service_role after app
-- authorization checks pass.

revoke insert on table public.payroll_imports from authenticated;
revoke insert, update on table public.payroll_import_rows from authenticated;

drop policy if exists imports_insert_manager on public.payroll_imports;
drop policy if exists import_rows_insert_manager on public.payroll_import_rows;
drop policy if exists import_rows_update_manager on public.payroll_import_rows;

comment on table public.payroll_imports is
  'Payroll import workflow state is server-owned. Authenticated clients may not insert import records directly.';

comment on table public.payroll_import_rows is
  'Payroll import row payloads are server-owned. Authenticated clients may not insert or update row payloads directly.';
