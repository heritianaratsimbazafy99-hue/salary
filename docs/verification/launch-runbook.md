# Launch Verification Runbook

This runbook is the functional release gate for the payroll platform. Sentry monitoring and Resend live delivery are included.

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

Run `npm run verify:prod-env` in an environment containing production variables before the first production deployment. Sentry and Resend variables are required.

## Manual Smoke

1. Open `/api/health` and expect HTTP `200` with `status: "ok"` and `checks.email: "configured"`.
2. Sign in as an agency manager.
3. Upload a payroll workbook with a mapped unknown column.
4. Save mappings and publish the import.
5. Sign in as the generated employee and confirm the payslip, history, and CSV download.
6. Sign in as HR and confirm analytics and audit entries.
7. Trigger one controlled non-sensitive test exception in a preview or staging deployment and confirm it appears in Sentry project `salary`.
8. Send one non-sensitive Resend smoke email from the verified production sender to an authorized test recipient.

## Resend Production Delivery

Resend delivery is part of the launch gate. Keep `RESEND_API_KEY` server-only and store it in Vercel as a sensitive Production and Preview variable.

Required application variables:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Supabase Auth must also use custom SMTP for magic links and account emails:

- host: `smtp.resend.com`
- port: `465`
- username: `resend`
- password: the Resend API key
- sender name: `MadajobPay`
- sender email: the verified sender configured in `RESEND_FROM_EMAIL`

Do not use `onboarding@resend.dev` for production. If no Resend sender domain is verified, launch is blocked until DNS verification is complete.

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
