# MVP Security Review

## Auth

- Magic link auth is handled by Supabase Auth.
- The Supabase service role key is server-only and must never be exposed through `NEXT_PUBLIC_`.

## Authorization

- RLS is enabled for all exposed public tables.
- Employees can read only their own current payslips.
- Agency managers are scoped to one agency.
- HR central has global read-only access for payroll workflows.
- Super admin access is minimal and audited.

## Sensitive Data

- Original Excel files are not retained after analysis.
- Email notifications do not include payroll amounts.
- Audit metadata excludes tokens and payroll snapshots.

## Verification Evidence

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `supabase db reset`
