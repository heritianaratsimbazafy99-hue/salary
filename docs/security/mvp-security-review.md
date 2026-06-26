# MVP Security Review

## Auth

- Magic link auth is handled by Supabase Auth.
- The Supabase service role key is server-only and must never be exposed through `NEXT_PUBLIC_`.
- Protected server routes resolve the current actor from Supabase Auth claims and the `profiles` table before authorization decisions.
- HR-created agency managers and linked employees are backed by Supabase Auth users and controlled `profiles.auth_user_id` records.

## Authorization

- RLS is enabled for all exposed public tables.
- RLS helper functions live in the private schema, run with an explicit search path, and expose execute grants only to `authenticated` and `service_role`.
- Employees can read only their own current payslips.
- Agency managers are scoped to one agency.
- HR central has global read-only access for payroll workflows.
- Super admin access is minimal and audited.
- Import and export API routes return structured 401, 403, and 422 responses for auth and validation failures.
- Publication writes use the service role only after the manager and agency guard has passed. User-scoped clients still load the import and enforce the authorization boundary before admin writes are created.
- Publication is allowed only from `READY_FOR_PREVIEW`; non-publishable statuses return conflict before admin write clients are created.
- Export requests create `export_jobs` and audit events only after the export authorization check passes.

## Sensitive Data

- Original Excel files are not retained after analysis.
- Email notifications do not include payroll amounts.
- Audit metadata excludes tokens and payroll snapshots.
- The notification test endpoint returns 404 in production before opening a Supabase client.
- Excel uploads are size-limited, `.xlsx`-restricted, period-checked against the submitted import period, and rejected when they exceed the 2,000 useful-row MVP limit.

## Verification Evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 warnings.
- `npm run test`: 20 test files passed, 160 tests passed.
- `npm run build`: passed.
- `npm run test:e2e`: 8 Playwright tests passed.
- `supabase db reset --local`: passed.
- `supabase db advisors --local --type all --level warn --fail-on error`: passed, no issues found.
- `npm audit --audit-level=high`: passed with 0 high or critical vulnerabilities; 4 moderate transitive advisories remain for a later dependency upgrade cycle.

## Residual Risks

- Payroll publication and export creation are controlled sequences of Supabase writes, not single database transactions or RPCs. A later hardening pass should move them into transaction-backed RPCs if partial-write rollback becomes required.
- Moderate dependency advisories require breaking forced upgrades according to `npm audit`; they are tracked but not blocking this MVP gate because no high or critical advisory is present.
