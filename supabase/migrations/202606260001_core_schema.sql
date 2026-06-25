create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'agency_manager',
  'employee',
  'hr_central',
  'super_admin'
);

create type public.import_status as enum (
  'UPLOADED',
  'NEEDS_MAPPING',
  'READY_FOR_PREVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'FAILED'
);

create type public.pay_item_category as enum (
  'BASE_PAY',
  'HOURS',
  'OVERTIME',
  'BONUS',
  'ABSENCE',
  'DEDUCTION',
  'BENEFIT',
  'INFORMATIONAL_NOTE',
  'OTHER_ELEMENTS'
);

create type public.notification_status as enum (
  'PENDING',
  'SENT',
  'FAILED'
);

create type public.export_status as enum (
  'PENDING',
  'COMPLETED',
  'FAILED'
);

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (btrim(code) <> '')
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email)),
  check (position('@' in email) > 1),
  check (btrim(full_name) <> '')
);

create table public.agency_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  employee_id text not null,
  email text not null,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, employee_id),
  unique (agency_id, email),
  constraint employees_id_agency_id_key unique (id, agency_id),
  check (email = lower(email)),
  check (position('@' in email) > 1),
  check (btrim(employee_id) <> ''),
  check (btrim(full_name) <> '')
);

create table public.payroll_imports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  uploaded_by uuid not null references public.profiles(id),
  status public.import_status not null default 'UPLOADED',
  source_filename text not null,
  valid_row_count integer not null default 0,
  invalid_row_count integer not null default 0,
  unknown_employee_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (valid_row_count >= 0),
  check (invalid_row_count >= 0),
  check (unknown_employee_count >= 0),
  check (btrim(source_filename) <> '')
);

create table public.payroll_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.payroll_imports(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id text not null,
  employee_email text not null,
  employee_name text not null,
  normalized_data jsonb not null,
  pay_items jsonb not null default '[]'::jsonb,
  manual_adjustments jsonb not null default '{}'::jsonb,
  has_manual_adjustments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(employee_id) <> ''),
  check (employee_email = lower(employee_email)),
  check (position('@' in employee_email) > 1),
  check (btrim(employee_name) <> ''),
  check (jsonb_typeof(normalized_data) = 'object'),
  check (jsonb_typeof(pay_items) = 'array'),
  check (jsonb_typeof(manual_adjustments) = 'object')
);

create table public.payroll_import_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.payroll_imports(id) on delete cascade,
  row_number integer not null,
  field_name text not null,
  error_code text not null,
  message text not null,
  raw_value text,
  created_at timestamptz not null default now(),
  check (row_number > 0),
  check (btrim(field_name) <> ''),
  check (btrim(error_code) <> ''),
  check (btrim(message) <> '')
);

create table public.column_mappings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source_column text not null,
  target_category public.pay_item_category not null,
  display_label text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, source_column),
  check (btrim(source_column) <> ''),
  check (btrim(display_label) <> '')
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid not null,
  period_start date not null,
  period_end date not null,
  current_version_id uuid,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  unique (agency_id, employee_id, period_start, period_end),
  constraint payslips_employee_agency_fk
    foreign key (employee_id, agency_id) references public.employees(id, agency_id) on delete cascade,
  check (period_end >= period_start),
  check (expires_at is null or expires_at > published_at)
);

create table public.payslip_versions (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  import_id uuid not null references public.payroll_imports(id),
  version_number integer not null,
  snapshot_data jsonb not null,
  pay_items jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles(id),
  replaced_at timestamptz,
  unique (payslip_id, version_number),
  check (version_number > 0),
  check (jsonb_typeof(snapshot_data) = 'object'),
  check (jsonb_typeof(pay_items) = 'array'),
  check (replaced_at is null or replaced_at >= published_at)
);

alter table public.payslips
  add constraint payslips_current_version_fk
  foreign key (current_version_id) references public.payslip_versions(id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  agency_id uuid references public.agencies(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  check (btrim(action) <> ''),
  check (btrim(resource_type) <> ''),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  notification_type text not null,
  resource_type text not null,
  resource_id uuid,
  status public.notification_status not null default 'PENDING',
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  check (recipient_email = lower(recipient_email)),
  check (position('@' in recipient_email) > 1),
  check (btrim(notification_type) <> ''),
  check (btrim(resource_type) <> ''),
  check (sent_at is null or status = 'SENT'),
  check (failed_at is null or status = 'FAILED')
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  export_type text not null,
  agency_id uuid references public.agencies(id) on delete set null,
  period_start date,
  period_end date,
  status public.export_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (btrim(export_type) <> ''),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (completed_at is null or status in ('COMPLETED', 'FAILED'))
);

create index agency_memberships_agency_id_idx on public.agency_memberships (agency_id);
create index employees_profile_id_idx on public.employees (profile_id);
create index employees_agency_active_idx on public.employees (agency_id, is_active);
create index payroll_imports_agency_period_idx on public.payroll_imports (agency_id, period_start, period_end);
create index payroll_import_rows_import_id_idx on public.payroll_import_rows (import_id);
create index payroll_import_rows_agency_id_idx on public.payroll_import_rows (agency_id);
create index payroll_import_errors_import_id_idx on public.payroll_import_errors (import_id);
create index column_mappings_agency_id_idx on public.column_mappings (agency_id);
create index payslips_employee_id_idx on public.payslips (employee_id);
create index payslips_agency_period_idx on public.payslips (agency_id, period_start, period_end);
create index payslips_current_version_id_idx on public.payslips (current_version_id);
create index payslip_versions_payslip_id_idx on public.payslip_versions (payslip_id);
create index payslip_versions_current_lookup_idx on public.payslip_versions (payslip_id, id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_agency_id_idx on public.audit_logs (agency_id);
create index notifications_recipient_profile_id_idx on public.notifications (recipient_profile_id);
create index export_jobs_requested_by_idx on public.export_jobs (requested_by);
create index export_jobs_agency_period_idx on public.export_jobs (agency_id, period_start, period_end);
