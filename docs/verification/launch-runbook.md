# Launch Verification Runbook

This runbook is the functional release gate for the payroll platform. Sentry monitoring is included. Resend live delivery is intentionally excluded for now; email templates and notification records can be verified, but external delivery is not a blocker.

## Required Local Services

1. Start Docker.
2. Run `supabase start`.
3. Run `supabase db reset --local`.

## Release Gate

Run these before shipping or opening a production PR:

```bash
npm run verify:ci
supabase start
supabase db reset --local
npm run test:e2e
supabase db advisors --local --type all --level warn --fail-on error
git diff --check
```

`npm run verify:ci` runs secret scanning, lint, typecheck, unit/integration tests, build, and a high-severity npm audit.

`npm run verify:full` runs secret scanning, lint, typecheck, unit/integration tests, build, E2E, Supabase advisors, and a high-severity npm audit.

Run `npm run verify:prod-env` in an environment containing production variables before the first production deployment. Sentry variables are required; Resend remains excluded.

## Manual Smoke

1. Open `/api/health` and expect HTTP `200` with `status: "ok"`.
2. Sign in as an agency manager.
3. Upload a payroll workbook with a mapped unknown column.
4. Save mappings and publish the import.
5. Sign in as the generated employee and confirm the payslip, history, and CSV download.
6. Sign in as HR and confirm analytics and audit entries.
7. Trigger one controlled non-sensitive test exception in a preview or staging deployment and confirm it appears in Sentry project `salary`.

## Resend Exclusion

Resend delivery is not part of this launch gate yet. Keep `RESEND_API_KEY` unset locally unless testing email delivery specifically. The health endpoint reports `email: "resend_excluded"` so monitoring does not confuse this deliberate exclusion with an outage.

## Sentry Monitoring

- Organization: `stark-3t`.
- Project: `salary`.
- Required variables: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- Default issue alert: high-priority issues by email.
- Do not enable replay on payroll screens without a separate privacy review.

## Production Lockdown References

- Production readiness checklist: `docs/verification/production-readiness.md`
- Backup and restore runbook: `docs/operations/supabase-backup-restore.md`
- PDF export improvement plan: `docs/superpowers/plans/2026-06-27-pdf-export-improvement.md`

## Rollback

If a release fails after deployment:

1. Disable traffic to the failed deployment or roll back to the previous Vercel deployment.
2. Preserve Supabase logs and audit logs before cleanup.
3. If a migration caused the failure, pause writes, restore from the latest verified backup, and replay only validated migrations.
4. Re-run this runbook before re-promoting.
