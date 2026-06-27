# Production Readiness Gate

Scope: lock production readiness outside Resend. Monitoring is handled by Sentry and is part of the production gate.

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
- Require at least 1 approving review.
- Dismiss stale approvals when new commits are pushed.
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
- `RESEND_API_KEY` is intentionally excluded for now.

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

## Security

- `npm audit --audit-level=high` must pass.
- `npm run check:secrets` must pass.
- `.env`, `.env.local`, `.env.*.local`, `.vercel`, `*.pem`, and `*.key` stay ignored.
- Service-role operations must remain server-only.
- CSV/PDF/export endpoints must keep role and agency scoping tests.

## Current Exclusions

- Resend production delivery.

This exclusion means the app can be treated as a production candidate only after CI, env, Sentry, branch protection, and backup/restore are complete. Final go-live still requires separate Resend work.
