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

To test an existing production build configured for local Supabase, use `PLAYWRIGHT_USE_PRODUCTION_BUILD=1 npm run test:e2e`. The build and runtime must use the same local environment values. This mode starts `next start` and refuses to reuse a development server.

For the CI-equivalent gate without local E2E, run:

```bash
npm run verify:ci
```

For the full launch gate, start Supabase and run:

```bash
npm run db:reset:local
npm run verify:full
```

Before configuring production, copy `.env.production.example` into the deployment platform secrets and run `npm run verify:prod-env` in an environment containing the real production values. Resend delivery and Sentry monitoring are included in the launch gate.

Follow `docs/verification/launch-runbook.md`, `docs/verification/production-readiness.md`, and `docs/operations/supabase-backup-restore.md` before promoting to production.

## Employee activation

Publishing payroll sends an invitation to employees who have not activated their accounts. The employee opens the invitation, enters the invited email address, and requests a separate confirmation email. Opening that confirmation in the same browser verifies the mailbox and atomically creates the employee profile and grants access to the payslip. Public Supabase signups remain disabled. Later connections use the existing magic-link login.

The invitation lasts 14 days; its browser-bound confirmation lasts 15 minutes. Confirmation requests are limited to one per minute. Invalid, expired, revoked, or already accepted invitations do not grant access. The manager can resend outstanding invitations from the published import without publishing payroll again.

Apply `supabase/migrations/20261013073709_employee_invitation_activation.sql` before deploying this activation flow. It adds the request throttle timestamp and updates the service-role-only acceptance function. Set `NEXT_PUBLIC_APP_URL` to the canonical public origin; callback redirects use this origin. Both invitation and activation emails use Resend, while subsequent login emails use Supabase Auth SMTP. No new secrets are needed.

The browser tests use a loopback HTTP receiver through the Resend SDK's `RESEND_BASE_URL` and the local Supabase mailbox. They create no employee Auth account or profile in advance. Run them with local Supabase running:

```bash
npm run test:e2e -- tests/e2e/employee-activation.spec.ts tests/e2e/invitation-security.spec.ts
```

These tests verify the application email content and actual Supabase authentication; delivery through the external email provider must also be smoke-tested in the intended deployment environment before release.

See [the activation verification record](docs/verification/employee-activation.md) for the tested scenarios, results and remaining release checks.

See [the dependency remediation record](docs/verification/dependency-remediation.md) for the resolved npm audit findings and the full verification against the local production build.
