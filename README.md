# Salary Platform

Internal payroll information platform for agency payroll imports and employee web payslips.

## Development

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase and Resend variables in `.env.local`.
3. Run `npm install`.
4. Run `supabase start`.
5. Run `supabase db reset`.
6. Run `npm run dev`.

## Verification

Run `npm run verify` before opening a pull request.

After starting Supabase/Docker, run `npm run test:e2e` for authenticated browser coverage.

For the CI-equivalent gate without local E2E, run:

```bash
npm run verify:ci
```

For the full launch gate, start Supabase and run:

```bash
npm run db:reset:local
npm run verify:full
```

Before configuring production, copy `.env.production.example` into the deployment platform secrets and run `npm run verify:prod-env` in an environment containing the real production values. Resend delivery and monitoring are intentionally excluded from the current gate.

Follow `docs/verification/launch-runbook.md`, `docs/verification/production-readiness.md`, and `docs/operations/supabase-backup-restore.md` before promoting to production.
