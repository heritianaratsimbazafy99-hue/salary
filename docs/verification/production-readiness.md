# Production Readiness Gate

Scope: lock the production release gate for the payroll platform. Sentry monitoring and Resend email delivery are part of the gate.

## Automated Gates

Required for every PR and every push to `main`:

- `npm run verify:ci`
- `supabase start`
- `npm run db:reset:local`
- `npm run test:e2e -- --project=chromium`
- `npm run db:advisors`

The repository enforces these through `.github/workflows/ci.yml`.

## Branch Protection

Protect `main` with:

- Require pull request before merging.
- Approval reviews disabled for the solo-owner workflow.
- Require status checks to pass before merging.
- Require branch to be up to date before merging.
- Required checks:
  - `Quality Gate`
  - `E2E Gate`
- Require conversation resolution before merging.
- Require linear history.
- Block force pushes.
- Block branch deletion.

## Environment Variables

Production must define these variables in the deployment platform:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Validation command:

```bash
npm run verify:prod-env
```

Rules:

- production URLs must use HTTPS;
- production URLs must not point to localhost or loopback hosts;
- `SUPABASE_SERVICE_ROLE_KEY` must never equal the public Supabase key;
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` must be between `0` and `1`;
- `SENTRY_AUTH_TOKEN` must stay server/build-only and never use a `NEXT_PUBLIC_` name;
- `RESEND_API_KEY` must be a server-only Resend key beginning with `re_`;
- `RESEND_FROM_EMAIL` must use a verified production sender, not `example.com` or `onboarding@resend.dev`.

## Monitoring

- Sentry organization: `stark-3t`.
- Sentry project: `salary`.
- Platform: Next.js.
- Default alert: high-priority issues with email notification.
- Source maps upload when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present during the production build.
- SDK privacy stance: `sendDefaultPii` is disabled, request body/query/cookies and sensitive headers are stripped before events are sent.

Smoke check after deployment:

1. Confirm the deployment environment contains the Sentry variables above.
2. Trigger a controlled test exception from a non-sensitive test path or staging preview.
3. Confirm the event appears in Sentry under project `salary`.
4. Resolve or delete the test issue after the smoke check.

## Database

- Supabase migrations must pass from an empty local reset.
- Supabase advisors must pass with `--fail-on error`.
- Restore drill must be completed using `docs/operations/supabase-backup-restore.md`.
- Production writes should be paused before any destructive restore.

## Email Delivery

- Resend application delivery must be configured in Vercel Production and Preview with `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- The sender domain must be verified in Resend before go-live.
- Supabase Auth must use custom SMTP for magic links and auth emails:
  - host: `smtp.resend.com`;
  - port: `465`;
  - username: `resend`;
  - password: `RESEND_API_KEY`;
  - sender name: `MadajobPay`;
  - sender email: the same verified sender domain used by `RESEND_FROM_EMAIL`.
- `/api/health` must return HTTP `200`, `status: "ok"`, and `checks.email: "configured"` after deployment.

## Security

- `npm audit --audit-level=high` must pass.
- `npm run check:secrets` must pass.
- `.env`, `.env.local`, `.env.*.local`, `.vercel`, `*.pem`, and `*.key` stay ignored.
- Service-role operations must remain server-only.
- CSV/PDF/export endpoints must keep role and agency scoping tests.

## Current Exclusions

There are no intentional functional launch exclusions. If Resend sender-domain verification or Supabase Auth SMTP configuration is missing, launch is blocked until that external configuration is complete.
