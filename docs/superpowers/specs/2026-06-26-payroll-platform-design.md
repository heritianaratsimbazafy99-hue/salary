# Payroll Platform Design

**Date:** 2026-06-26

**Status:** Draft for user review

**Goal:** Build a secure internal payroll information platform where agency managers upload validated Excel payroll data, preview generated internal payslips, publish them manually, and employees consult their current published payslips through authenticated personal spaces.

**Non-goal:** The platform is not a legal payroll calculation engine. It does not calculate statutory payroll obligations or generate official legal payslips in the MVP.

---

## 1. Product Scope

The platform transforms already-validated Excel payroll data into internal web payslips.

The MVP includes:

- Agency manager authentication through Supabase magic links.
- Employee authentication through Supabase magic links.
- HR central and super admin roles.
- Agency creation and management by HR central and super admin.
- Agency manager creation and agency assignment by HR central, with super admin correction rights.
- Excel upload for one agency and one payroll period.
- One supported worksheet named `payroll`.
- Server-side Excel parsing and validation.
- Per-agency column mapping for unknown columns, with mappings remembered for future imports.
- Valid row import even when other rows contain errors.
- Unknown employee detection from valid rows.
- Manual confirmation before inviting newly detected employees.
- Preview of generated internal payslips.
- Manual correction of valid preview rows before publication.
- Manual publication by the agency manager.
- Email notification to employees after publication through Resend.
- Employee access to only the currently published web payslip for each period.
- Wide audit logging of sensitive actions.
- Import report exports and published payslip exports as isolated modules.
- Detailed analytics for HR central and super admin as an isolated module.

Post-MVP items that must be anticipated but not implemented in the initial core:

- PDF generation and download.
- Browser print-specific polishing.
- Long-term archival workflows beyond the first retention fields.
- More advanced asynchronous processing if import volume grows beyond the current target.

The chosen delivery approach is a secure foundation with activable modules. The first priority is the payroll/auth/RLS/import/publication foundation. Exports and detailed analytics are designed as separate modules so they do not destabilize the sensitive payroll core.

Scale assumptions:

- A few agencies at launch.
- Fewer than 1,000 employees in the first production scope.
- Simple Excel files optimized for one row per employee and one payroll period per import.
- Initial import cap: 10 MB and 2,000 rows per file. This cap may be lowered before production if runtime verification shows Vercel request or memory pressure.

Localization assumptions:

- Interface language: French.
- Currency: Ariary only.
- Stored currency code: `MGA`.

## 2. Target Users And Permissions

### Agency Manager

An agency manager belongs to exactly one agency in the MVP.

Agency managers can:

- Access only their assigned agency.
- Upload Excel payroll files for their agency.
- Map unknown columns for their agency.
- View import reports for their agency.
- View valid rows and invalid rows for their agency imports.
- Confirm invitations for newly detected employees in their agency.
- Preview generated payslips for their agency.
- Correct valid preview rows before publication.
- Publish payslips for their agency.
- Export import reports for their agency.

Agency managers cannot:

- Access another agency.
- View global analytics.
- View or modify role assignments.
- Modify a published payslip directly.
- Publish for another agency.

### Employee

Employees authenticate with Supabase magic links and are linked by:

- Supabase Auth user id.
- Business `employee_id`.
- Email.
- Agency id.

Employees can:

- View only their own currently published web payslips.
- Download a CSV summary of their own published payslips.
- Receive email notification after a new payslip is published.

Employees cannot:

- See replaced historical versions.
- See other employees.
- Upload files.
- Export another employee's payroll data or global payroll data.
- Access analytics.
- Download PDFs in the MVP.

### HR Central

HR central is a sensitive global read role.

HR central can:

- Create and modify agencies.
- Create agency managers and assign them to agencies.
- View all agencies.
- View all imports.
- View all published payslips.
- View all audit logs.
- View detailed analytics, including individual payroll data.
- Export import reports and published payslips.

HR central cannot:

- Publish payslips on behalf of agency managers.
- Modify import rows.
- Correct payroll data.
- Change super admin assignments.

### Super Admin

Super admin is a minimal technical administration role.

Super admin can:

- Perform all HR central read actions.
- Correct technical role and agency assignment issues.
- View audit logs.
- Access detailed analytics.
- Export reports and published payslips.

Super admin actions are always audited.

## 3. Technical Architecture

The recommended stack is:

- Next.js App Router.
- TypeScript.
- Vercel deployment.
- Supabase Auth for magic links and sessions.
- Supabase Postgres for business data.
- Supabase Row Level Security for authorization boundaries.
- Supabase Storage only if temporary upload staging is needed.
- Resend for application email notifications.
- Tailwind CSS and a sober component system such as shadcn/ui for operational UI.

Excel parsing runs server-side in the Node runtime. The browser sends the upload to an authenticated server route or server action. The server validates file type, file size, worksheet name, required columns, optional columns, values, and row count. The original Excel file is not retained after analysis.

The platform stores:

- Structured normalized payroll data.
- Flexible categorized pay items.
- Import reports.
- Validation errors.
- Corrections performed in preview.
- Publication records.
- Audit events.

The platform does not use user-editable metadata for authorization. Roles and agency assignments are stored in controlled database tables and enforced by RLS policies plus server-side checks.

## 4. Excel Import Contract

One file represents:

- One agency.
- One payroll period.
- One worksheet named `payroll`.

One row represents:

- One employee for that payroll period.

The MVP proposes this standard worksheet shape:

| Column | Required | Purpose |
| --- | --- | --- |
| `employee_id` | Yes | Stable business identifier for the employee. |
| `email` | Yes | Employee email for account linking and invitations. |
| `period_start` | Yes | Payroll period start date. |
| `period_end` | Yes | Payroll period end date. |
| `employee_name` | Yes | Display name in manager previews and employee payslip. |
| `role` | No | Employee role or position. |
| `department` | No | Employee department or team. |
| `contract_type` | No | Optional contract label. |
| `base_salary` | No | Base salary amount in MGA. |
| `hours_worked` | No | Regular worked hours. |
| `overtime_hours` | No | Overtime hours. |
| `gross_amount` | Yes | Gross amount in MGA. |
| `deductions_total` | Yes | Total deductions in MGA. |
| `net_amount` | Yes | Net amount in MGA. |
| `payment_date` | No | Expected or actual payment date. |
| `notes` | No | Internal payroll note shown according to payslip display rules. |

Unknown columns are not silently ignored. The agency manager must map them into a category before import preview continues.

Supported item categories:

- Base pay.
- Hours.
- Overtime.
- Bonus.
- Absence.
- Deduction.
- Benefit.
- Informational note.
- Other elements.

Column mappings are remembered per agency. On future imports, known mappings are applied automatically and still shown to the manager for review.

Validation behavior:

- Valid rows are imported into the import batch.
- Invalid rows are recorded with row number, field, code, and human-readable message.
- A file with mixed valid and invalid rows does not fail as a whole.
- Publication only includes rows that are valid at publication time.

## 5. Import And Publication Workflow

### Upload

The agency manager selects a payroll period and uploads one Excel file.

The server:

- Authenticates the user.
- Confirms the user is manager of the selected agency.
- Validates file type and size.
- Parses the `payroll` worksheet.
- Applies existing column mappings.
- Requires mapping for unknown columns.
- Creates a `payroll_imports` record.
- Creates valid `payroll_import_rows` records.
- Creates invalid row error records.
- Deletes or discards the original Excel file after analysis.
- Writes audit events.

### Mapping

If unknown columns are found, the manager maps each unknown column to one supported category. A category named `Other elements` is available. The final mapping is stored per agency.

### Preview

The manager sees:

- Import summary.
- Valid row count.
- Invalid row count.
- Unknown employee count.
- New employee invitation candidates.
- Row-level errors.
- Generated payslip preview for valid rows.
- Rows modified manually after import.

### Corrections

The manager may correct valid rows before publication. Corrections are saved as preview-stage changes and audited. Corrections are visible to agency manager, HR central, and super admin. Employees do not see a marker showing that their payslip was modified compared with the Excel source.

### Invitation Confirmation

When valid rows contain unknown employees, the manager sees a confirmation list. The manager chooses which new employees to invite. Invitation sends a Supabase magic link invitation flow or equivalent email-based account activation flow.

### Publication

The manager publishes manually.

Publication:

- Creates immutable published payslip records for valid selected rows.
- Replaces the currently visible payslip version for the same agency, employee, and period.
- Preserves previous versions internally.
- Sends Resend notification emails to affected employees.
- Records publication and notification audit events.

If the same agency and payroll period are uploaded again, the new import becomes a new version candidate. It does not replace the currently visible employee payslips until manually published.

## 6. Data Model

The core tables are:

- `agencies`
- `profiles`
- `agency_memberships`
- `employees`
- `payroll_imports`
- `payroll_import_rows`
- `payroll_import_errors`
- `column_mappings`
- `payslips`
- `payslip_versions`
- `audit_logs`
- `notifications`
- `export_jobs`

### `agencies`

Stores agency identity and lifecycle state.

Key fields:

- `id`
- `name`
- `code`
- `is_active`
- `created_at`
- `updated_at`

### `profiles`

Stores controlled application identity linked to Supabase Auth.

Key fields:

- `id`
- `auth_user_id`
- `email`
- `full_name`
- `role`
- `created_at`
- `updated_at`

Allowed roles:

- `agency_manager`
- `employee`
- `hr_central`
- `super_admin`

### `agency_memberships`

Links agency managers to agencies.

Key fields:

- `id`
- `profile_id`
- `agency_id`
- `created_at`

MVP rule: one active agency per agency manager.

### `employees`

Stores employees by agency and business employee id.

Key fields:

- `id`
- `agency_id`
- `profile_id`
- `employee_id`
- `email`
- `full_name`
- `is_active`
- `created_at`
- `updated_at`

Unique constraints:

- `agency_id + employee_id`
- `agency_id + email`

### `payroll_imports`

Stores one upload/import attempt for one agency and period.

Key fields:

- `id`
- `agency_id`
- `period_start`
- `period_end`
- `uploaded_by`
- `status`
- `source_filename`
- `valid_row_count`
- `invalid_row_count`
- `unknown_employee_count`
- `created_at`
- `updated_at`

Allowed statuses:

- `UPLOADED`
- `NEEDS_MAPPING`
- `READY_FOR_PREVIEW`
- `PUBLISHED`
- `SUPERSEDED`
- `FAILED`

### `payroll_import_rows`

Stores valid imported rows and preview corrections.

Key fields:

- `id`
- `import_id`
- `agency_id`
- `employee_id`
- `employee_email`
- `employee_name`
- `normalized_data`
- `pay_items`
- `manual_adjustments`
- `has_manual_adjustments`
- `created_at`
- `updated_at`

`normalized_data` stores the standard fields. `pay_items` stores categorized flexible fields.

### `payroll_import_errors`

Stores invalid row details.

Key fields:

- `id`
- `import_id`
- `row_number`
- `field_name`
- `error_code`
- `message`
- `raw_value`
- `created_at`

### `column_mappings`

Stores per-agency mappings for non-standard Excel columns.

Key fields:

- `id`
- `agency_id`
- `source_column`
- `target_category`
- `display_label`
- `created_by`
- `created_at`
- `updated_at`

### `payslips`

Stores the currently visible published payslip pointer per agency, employee, and period.

Key fields:

- `id`
- `agency_id`
- `employee_id`
- `period_start`
- `period_end`
- `current_version_id`
- `published_at`
- `published_by`
- `expires_at`

Unique constraint:

- `agency_id + employee_id + period_start + period_end`

### `payslip_versions`

Stores immutable published payslip snapshots.

Key fields:

- `id`
- `payslip_id`
- `import_id`
- `version_number`
- `snapshot_data`
- `pay_items`
- `published_at`
- `published_by`
- `replaced_at`

Published versions are append-only. Corrections after publication require a new import or new version candidate.

### `audit_logs`

Stores sensitive action history.

Key fields:

- `id`
- `actor_profile_id`
- `actor_role`
- `agency_id`
- `employee_id`
- `action`
- `resource_type`
- `resource_id`
- `metadata`
- `ip_address`
- `user_agent`
- `created_at`

Audit metadata must not include full payroll snapshots, secrets, magic link tokens, or raw Excel file contents.

### `notifications`

Stores application email notification state.

Key fields:

- `id`
- `recipient_profile_id`
- `recipient_email`
- `notification_type`
- `resource_type`
- `resource_id`
- `status`
- `provider_message_id`
- `created_at`
- `sent_at`
- `failed_at`
- `failure_reason`

### `export_jobs`

Stores export requests for import reports and published payslips.

Key fields:

- `id`
- `requested_by`
- `export_type`
- `agency_id`
- `period_start`
- `period_end`
- `status`
- `created_at`
- `completed_at`

Exports are available only to authorized roles and every export is audited.

## 7. Security Model

Supabase RLS is mandatory on every table exposed through Supabase APIs.

Authorization rules:

- Employees can select only their own published current payslips.
- Agency managers can select and modify import workflow data only for their assigned agency.
- Agency managers can publish only for their assigned agency.
- HR central can read across agencies but cannot modify imports or publish.
- Super admin can perform technical administration actions and all such actions are audited.
- No authorization decision uses user-editable metadata.
- Service role credentials are never exposed to the browser.

Validation rules:

- Validate all upload inputs at the server boundary.
- Validate Excel file type.
- Validate maximum file size of 10 MB for the MVP.
- Validate worksheet name.
- Validate required columns.
- Validate dates.
- Validate emails.
- Validate numeric amounts.
- Validate period consistency.
- Validate row count against the MVP limit of 2,000 rows.

Sensitive data rules:

- The original Excel file is not retained after analysis.
- Raw Excel values are stored only where needed for import error explanation.
- Technical logs must not contain full payroll data.
- Audit logs must record action context without storing full sensitive snapshots.
- Exports are restricted, audited, and generated only on demand.

Retention:

- Payroll data is kept for a short MVP window, expected between 12 and 24 months.
- Data tables include `expires_at` or equivalent archival fields where relevant.
- Deletion or archival execution can be implemented after the core MVP, but the schema must anticipate it.

## 8. Audit Requirements

The MVP audits:

- Login events when available to the application.
- Invitation creation.
- Employee account linking.
- Upload attempts.
- Upload validation failures.
- Column mapping creation and updates.
- Import preview access.
- Manual preview corrections.
- Publication.
- Employee payslip consultation.
- HR central access to sensitive global data.
- Super admin role or assignment changes.
- Export creation and download.
- Detailed analytics access.
- Notification send attempts and failures.

Audit views are available to HR central and super admin.

## 9. UI Structure

The UI is operational, dense, and restrained. It should feel like a secure internal business tool, not a marketing site.

Primary areas:

- Authentication screens.
- Agency manager dashboard.
- Upload and mapping workflow.
- Import report view.
- Payslip preview and correction view.
- Publication confirmation view.
- Employee payslip space.
- HR central agency management.
- HR central user and manager management.
- Audit log view.
- Export center.
- Analytics dashboard for HR central and super admin.
- Super admin technical administration.

The upload workflow should use a stepper:

1. Upload.
2. Mapping.
3. Validation report.
4. Employee invitations.
5. Preview and corrections.
6. Publish.

Every step has loading, empty, error, and success states.

## 10. Analytics Module

Detailed analytics are reserved for HR central and super admin.

The module may display:

- Total gross payroll by period.
- Total net payroll by period.
- Hours worked by period.
- Overtime by period.
- Deduction totals by period.
- Import error rates.
- Publication progress.
- Employee-level payroll rows.
- Agency comparisons.

Because analytics can expose individual payroll data:

- Access is denied to agency managers and employees.
- Every analytics access is audited.
- Filters must avoid leaking cross-agency data through query parameters or client-side filtering.
- Aggregation and individual detail queries must run behind server-side authorization and RLS.

## 11. Export Module

The MVP includes export capability as a module.

Export types:

- Import report CSV/XLSX for agency managers on their own agency.
- Import report CSV/XLSX for HR central and super admin across authorized scopes.
- Published payslip CSV/XLSX for HR central and super admin.

Exports are generated from structured database data, not from retained Excel originals.

Export access is audited.

## 12. Email Notifications

Supabase Auth handles magic link authentication.

Resend handles application notifications.

Notification events:

- Payslip published for employee.
- Optional invitation or onboarding message after manager confirmation for new employees.

Emails must not include sensitive payroll amounts. They should state that a new internal payslip is available and link the employee to the authenticated application.

## 13. Testing And Verification Strategy

Unit tests:

- Excel parsing.
- Required column detection.
- Unknown column mapping.
- Per-agency mapping reuse.
- Row validation.
- Amount parsing in MGA.
- Date parsing.
- Email validation.
- Pay item categorization.
- Publication versioning logic.

Database tests:

- RLS denies employee access to another employee's payslip.
- RLS denies agency manager access to another agency.
- RLS allows HR central read access across agencies.
- RLS prevents HR central publication.
- RLS prevents employee export and analytics access.
- Published versions are append-only.

Integration tests:

- Upload to preview.
- Mixed valid and invalid rows.
- Unknown employee detection.
- Invitation confirmation.
- Manual correction before publication.
- Publication replacement of current visible version.
- Employee sees only current published payslip.
- Notification records created on publication.
- Audit records created for sensitive actions.

UI/browser verification:

- Upload workflow keyboard navigation.
- Mapping workflow usability.
- Import report error states.
- Preview correction flow.
- Employee payslip access.
- HR audit log filtering.
- Responsive behavior at 320px, 768px, 1024px, and 1440px.
- No console errors in core flows.

Security verification:

- No service role key in client bundles.
- No sensitive payroll snapshots in logs.
- Upload size limits enforced.
- File type validation enforced.
- All protected pages require authentication.
- RLS policies tested for each role.
- Exports and analytics are auditable.

## 14. Implementation Planning Notes

The implementation plan should be split into independent tasks that can be executed through subagent-driven development.

Recommended task sequence:

1. Project scaffold and baseline configuration.
2. Supabase schema, roles, RLS, and seed fixtures.
3. Auth and protected route foundation.
4. HR agency and manager management.
5. Employee model and account linking.
6. Excel parser and validation library.
7. Upload and import batch workflow.
8. Column mapping workflow.
9. Import report and invalid row handling.
10. Preview and manual correction workflow.
11. Employee invitation confirmation.
12. Publication and immutable versioning.
13. Employee payslip space.
14. Resend notification integration.
15. Audit log recording and audit UI.
16. Export module.
17. Analytics module.
18. End-to-end verification and security review.

Each task should include tests before implementation where practical, and each task should be reviewed for spec compliance and code quality before moving to the next task.
