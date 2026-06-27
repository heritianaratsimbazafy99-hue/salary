# MVP Verification

## Latest Local Evidence

Verified on 2026-06-26 from branch `codex/payroll-platform`.

## Commands

- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 warnings.
- `npm run test`: 21 test files passed, 166 tests passed.
- `npm run build`: passed after sandbox escalation for Turbopack process/port access.
- `supabase db reset --local`: passed, replayed migrations `202606260001_core_schema.sql`, `202606260002_rls_policies.sql`, `202606260003_reporting_views.sql`, `20260626064151_payroll_publish_mapping_hardening.sql`, and `supabase/seed.sql`.
- SQL proof transaction: `public.publish_payroll_import(...)` returned `PUBLISHED` with 1 payslip, 1 version, and 1 notification before rollback.
- RPC grant check: `publish_payroll_import` is `security definer`, has `search_path=""`, denies `anon` and `authenticated`, and grants execute to `service_role`.
- `supabase db advisors --local --type all --level warn --fail-on error`: passed, no issues found.
- `npm run test:e2e`: 8 Playwright tests passed across desktop Chromium and mobile Pixel 5.
- `npm audit --audit-level=high`: passed with 0 high or critical vulnerabilities. It reports 4 moderate transitive advisories in `next/postcss` and `exceljs/uuid`; available fixes are force upgrades with breaking dependency changes.
- `git diff --check`: passed.

## Browser Checks

- Anonymous users are redirected to `/auth/login` instead of seeing restricted manager import list, manager import detail, employee payslip, and HR analytics spaces on desktop and mobile.

## Remaining Verification Notes

- Resend live delivery is now part of the production release gate. The committed boundary verifies notification templates do not expose payroll amounts, disables the local test endpoint in production, and requires Resend configuration in production env validation.
- Local Supabase secret keys from `supabase status` are not committed and must not be copied into public client environment variables.
- Manager import, column mapping resolution, transactional publication, export, employee auth linking, and protected manager pages are verified by unit/integration tests; browser E2E currently verifies anonymous access guards rather than a seeded authenticated payroll journey.
