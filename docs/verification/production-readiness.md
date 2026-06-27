# Production Readiness Gate

Scope: lock production readiness outside monitoring and Resend. Those two areas remain explicitly excluded until separate setup is requested.

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
- `SUPABASE_SERVICE_ROLE_KEY`

Validation command:

```bash
npm run verify:prod-env
```

Rules:

- production URLs must use HTTPS;
- production URLs must not point to localhost or loopback hosts;
- `SUPABASE_SERVICE_ROLE_KEY` must never equal the public Supabase key;
- `RESEND_API_KEY` is intentionally excluded for now.

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

- Monitoring and alerting setup.
- Resend production delivery.

These exclusions mean the app can be treated as a production candidate only after CI, env, branch protection, and backup/restore are complete. Final go-live still requires separate monitoring and Resend work.
