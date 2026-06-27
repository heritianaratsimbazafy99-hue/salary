# Functional Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the payroll platform demonstrably functional outside Resend live delivery by fixing audit findings and adding real authenticated verification.

**Architecture:** Keep fixes close to existing Next.js server components, API routes, Supabase services, and Playwright tests. Prefer server-side guards and small client form resilience changes over broad rewrites.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth/Postgres/RLS, Vitest, Playwright, ExcelJS, TypeScript, ESLint.

---

### Task 1: Repair Launch Gates And Navigation Safety

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `src/components/shell/RoleNav.tsx`
- Modify: `src/app/hr/agencies/page.tsx`
- Modify: `src/app/hr/users/page.tsx`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/api/notifications/test/route.ts`
- Modify: `next.config.ts`

- [x] Ignore generated and agent worktree directories in ESLint so `npm run lint` checks the active project only.
- [x] Expand verification scripts so the standard gate includes lint, typecheck, unit tests, and build; keep E2E as an explicit full gate.
- [x] Remove or retarget nav links that point to missing routes, and expose active link state.
- [x] Make `/hr/agencies` and `/hr/users` handle anonymous and forbidden access like the other protected HR pages.
- [x] Redirect successful auth callbacks to the role's primary workspace.
- [x] Restrict the notification preview endpoint to HR/super admin in non-production.
- [x] Add baseline security headers without breaking local development.

### Task 2: Fix Payroll Workflow Gaps

**Files:**
- Modify: `src/lib/payroll/parser.ts`
- Modify: `src/lib/payroll/mapping.ts`
- Modify: `src/app/manager/imports/[importId]/page.tsx`
- Modify: `src/lib/payroll/publish.ts`
- Modify: `src/app/api/imports/[importId]/publish/route.ts`
- Modify: `src/lib/employees/linking.ts`
- Test: `src/test/unit/parser.test.ts`
- Test: `src/test/unit/mapping.test.ts`
- Test: `src/test/unit/publish.test.ts`

- [x] Normalize imported employee IDs consistently with employee auth linking.
- [x] Parse mapped numeric values with the same tolerance as standard payroll amounts.
- [x] Show only unmapped unknown columns in the mapping form to avoid overwriting existing mappings.
- [x] Ensure employee auth profiles are created or linked before publication so published payslips can be viewed by employees.
- [x] Add or update unit tests for normalization, mapped amounts, and employee provisioning.

### Task 3: Make Export Functional

**Files:**
- Modify: `src/app/api/exports/route.ts`
- Modify: `src/lib/payroll/export.ts`
- Test: `src/test/integration/export-flow.test.ts`
- Test: `src/test/unit/admin-permissions.test.ts`

- [x] Generate CSV content for `IMPORT_REPORT` and `PUBLISHED_PAYSLIPS`.
- [x] Mark export jobs as `COMPLETED` when the synchronous CSV response is produced.
- [x] Return a downloadable `text/csv` response with export job metadata in headers.
- [x] Keep existing authorization rules: managers only export their agency import report; HR/super admin can export global or agency-scoped data.
- [x] Add tests that assert real CSV content and forbidden cases.

### Task 4: Harden Client Form Error States

**Files:**
- Modify: `src/components/imports/PayrollImportUploadForm.tsx`
- Modify: `src/components/imports/ColumnMappingForm.tsx`
- Modify: `src/components/imports/PublishImportButton.tsx`

- [x] Add `try/catch/finally` handling around client `fetch` calls.
- [x] Show network/API failures in `role="alert"` regions.
- [x] Ensure buttons are re-enabled after failures.

### Task 5: Add Real Authenticated E2E Coverage

**Files:**
- Create: `tests/e2e/helpers/supabase-fixtures.ts`
- Create: `tests/e2e/authenticated-payroll.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`
- Create or modify: `docs/verification/launch-runbook.md`

- [x] Add Playwright helpers that create temporary Supabase Auth users, profiles, agencies, memberships, and payroll workbooks.
- [x] Authenticate via Supabase SSR cookies generated from temporary password sessions, avoiding Resend/Mailpit coupling.
- [x] Test manager upload -> mapping -> publish -> employee login -> payslip visibility/history/export -> HR analytics/audit.
- [x] Test protected HR pages redirect/deny correctly for anonymous or wrong roles.
- [x] Document the launch gate commands, health check, rollback path, and Resend exclusion.

### Verification Gate

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build` with local Supabase public env
- [ ] `supabase db reset --local`
- [ ] `supabase db advisors --local --type all --level warn --fail-on error`
- [ ] `npm run test:e2e`
- [ ] `npm audit --audit-level=high`
- [ ] Browser smoke screenshots/checks on desktop and mobile
- [ ] `git diff --check`
