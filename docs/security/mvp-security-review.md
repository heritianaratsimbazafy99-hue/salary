# MVP Security Review

## Auth

- Magic link auth is handled by Supabase Auth.
- The Supabase service role key is server-only and must never be exposed through `NEXT_PUBLIC_`.
- Protected server routes resolve the current actor from Supabase Auth claims and the `profiles` table before authorization decisions.

## Authorization

- RLS is enabled for all exposed public tables.
- RLS helper functions live in the private schema, run with an explicit search path, and expose execute grants only to `authenticated` and `service_role`.
- Employees can read only their own current payslips.
- Agency managers are scoped to one agency.
- HR central has global read-only access for payroll workflows.
- Super admin access is minimal and audited.
- Import and export API routes return structured 401, 403, and 422 responses for auth and validation failures.
- Publication writes use the service role only after the manager and agency guard has passed. User-scoped clients still load the import and enforce the authorization boundary before admin writes are created.

## Sensitive Data

- Original Excel files are not retained after analysis.
- Email notifications do not include payroll amounts.
- Audit metadata excludes tokens and payroll snapshots.
- The notification test endpoint returns 404 in production before opening a Supabase client.

## Verification Evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 warnings.
- `npm run test`: 19 test files passed, 145 tests passed.
- `npm run build`: passed.
- `npm run test:e2e`: 8 Playwright tests passed.
- `supabase db reset --local`: passed.
- `supabase db advisors --local --type all --level warn --fail-on error`: passed, no issues found.
- `npm audit --audit-level=high`: passed with 0 high or critical vulnerabilities; 4 moderate transitive advisories remain for a later dependency upgrade cycle.

## Residual Risks

- Payroll publication is a controlled sequence of Supabase writes, not a single database transaction or RPC. A later hardening pass should move publication into a transaction-backed RPC if partial-write rollback becomes required.
- Moderate dependency advisories require breaking forced upgrades according to `npm audit`; they are tracked but not blocking this MVP gate because no high or critical advisory is present.
