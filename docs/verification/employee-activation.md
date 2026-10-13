# Employee activation verification — 2026-10-13

> Rapport historique de cette étape. L’activation et la correction des dépendances ont ensuite été déployées dans la release d6e21098. Pour la fermeture des parcours et les décisions d’exploitation, consulter `employee-opening-release-2026-10-13.md` et le runbook actualisé.

Status: implemented and verified locally; not deployed by this task.

## Delivered behavior

- Payroll publication sends an activation invitation to an unlinked employee.
- The employee enters the invited address and receives a separate confirmation email.
- Confirmation in the requesting browser verifies the mailbox before creating the employee profile and attaching the employee record.
- The employee can read the published payslip, export CSV, and later sign in through the ordinary email login.
- Managers can resend outstanding invitations from a published import. The new invitation replaces the previous link.
- Invalid, expired, revoked, replayed, mismatched and unauthorized activations are refused. Requests are throttled; a throttled resend preserves the last usable confirmation context.
- Invitation and Auth tokens are removed from Sentry error events, navigation breadcrumbs, transactions and spans.

## Verification evidence

| Check | Result |
| --- | --- |
| ESLint and TypeScript | Passed |
| Vitest | 296 tests passed across 31 files |
| Production build with local service configuration | Passed; no deployment or Sentry upload |
| Full Playwright suite | 40 tests passed, Chromium desktop and Pixel 5 emulation, 2.9 minutes |
| Supabase migrations from local reset | Passed, including the activation migration |
| Supabase advisors | No issues found |
| Secret scan, including new untracked source files | Passed |
| Post-test fixture cleanup | No test Auth users, profiles, employees, imports or invitations remaining |

The activation E2E creates only the manager and HR accounts as fixtures. No employee Auth user or profile exists before the invitation flow. It captures the actual composed Resend messages through a loopback receiver and uses real local Supabase Auth verification and Mailpit delivery. It also exercises manager resend, wrong address, expiration/revocation, another browser, substituted token, cooldown, CSV access, replay refusal, subsequent login and manager-route refusal. No browser console errors or uncaught page errors occurred in this flow. Desktop and mobile screenshots were visually inspected without overflow.

An infrastructure issue after the database reset (Kong returning 502 for Auth) was resolved by restarting the Salary-local gateway before the successful final run. No other project's containers were changed.

## Remaining release checks

1. Apply `supabase/migrations/20261013073709_employee_invitation_activation.sql` to the intended environment before deploying the application changes.
2. Check the canonical HTTPS `NEXT_PUBLIC_APP_URL`, verified Resend sender and Supabase Auth SMTP, then smoke-test actual inbox delivery and activation in that environment. External delivery is not established by the local mail receiver.
3. Dependency audit remediation was completed in the follow-up task: all 21 findings are resolved, and `verify:full` passes with 312 unit tests and 40 E2E tests against the local production build. See [dependency remediation evidence](dependency-remediation.md). The results above describe the initial activation implementation before that dependency update.

No production database migration, Git push or deployment was performed.
