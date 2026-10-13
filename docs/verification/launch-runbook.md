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
7. As superadmin, run the controlled smoke on `/hr/operations`, then confirm the returned event in Sentry project `salary` and the alert email to the owner. No preview is required or authorized.
8. Send one non-sensitive Resend smoke email from the verified production sender to an authorized test recipient.

## Resend Production Delivery

Resend delivery is part of the launch gate. Keep `RESEND_API_KEY` server-only and store it in Vercel as a sensitive Production variable.

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
- Alert recipient and interim support owner: heritiana.ratsimbazafy99@gmail.com.
- Incident rule: 660861 (high priority). Controlled smoke rule: 1367175, tag `purpose=launch_smoke`, owner only, 30-minute email throttle. The application enforces a 15-minute audit-based cooldown; a repeated smoke within 30 minutes may be captured without a second alert.
- Do not enable replay on payroll screens without a separate privacy review.

## Production Lockdown References

- Production readiness checklist: `docs/verification/production-readiness.md`
- Backup and restore runbook: `docs/operations/supabase-backup-restore.md`
- PDF export improvement plan: `docs/superpowers/plans/2026-06-27-pdf-export-improvement.md`

## Rollback

If a release fails after deployment:

1. Disable traffic to the failed deployment or roll back to the previous Vercel deployment.
2. Preserve Supabase logs and audit logs before cleanup.
3. If a migration caused the failure, pause writes and diagnose the schema before a reviewed forward fix. Backups were explicitly deferred by the owner on 2026-10-13; do not claim a restore is available. Follow the backup runbook only once a verified backup exists.
4. Re-run this runbook before re-promoting.

## Owner decisions — 2026-10-13

Payroll retention is one calendar year in UTC; see `docs/operations/payroll-retention.md`. Backups and paid subscription changes are deferred by explicit owner instruction. This exception removes that launch prerequisite for this release; restoration is not guaranteed. Help, Excel template, account lifecycle, exports, and monitoring are available through the authenticated application.
