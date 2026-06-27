# Supabase Backup And Restore Runbook

This runbook locks the database operations required before production. Monitoring is covered by Sentry, and email delivery is covered by the Resend release gate.

## Production Backup Requirements

- Enable Supabase managed backups before the first production payroll import.
- Keep point-in-time recovery enabled if the production project plan supports it.
- Restrict dashboard backup/restore permissions to the project owner and one named backup operator.
- Record the latest successful backup timestamp before every release that changes migrations or payroll publication logic.
- Never use production service-role credentials in CI or local E2E.

## Pre-Release Database Gate

Run locally against the Supabase stack before deployment:

```bash
supabase start
npm run db:reset:local
npm run db:advisors
npm run test:e2e
```

Expected result:

- migrations apply from an empty local database;
- seed data loads;
- advisors return no error-level findings;
- authenticated manager, HR, and employee flows pass.

## Restore Drill

Run one restore drill before launch, then repeat after any migration that changes payroll, auth, RLS, or audit tables.

1. Create a non-production Supabase project dedicated to restore testing.
2. Restore the latest production-like backup into that project.
3. Apply migrations from the current `main` branch.
4. Run the smoke flow from `docs/verification/launch-runbook.md`.
5. Confirm these invariants:
   - `profiles.auth_user_id` links remain intact;
   - agency managers cannot read other agencies;
   - employees can read only their own payslips;
   - `export_jobs` and `audit_logs` remain queryable by authorized roles;
   - no service-role key is required in browser code.
6. Record the restore date, source backup timestamp, target project, command log location, and operator.

## Rollback Decision

Use restore only when a database migration or publication flow causes data integrity risk. For application-only failures, prefer Vercel rollback to the previous deployment and preserve the database.

Rollback trigger examples:

- payroll publication creates incorrect payslip amounts;
- RLS policy blocks authorized users or exposes cross-agency data;
- migration partially applies or corrupts payroll/import state;
- service-role workflow fails after writing partial records.

## Data Handling Rules

- Do not export production payroll data to local machines for debugging.
- Do not email backup archives.
- Do not paste service-role keys into tickets, chats, docs, or CI logs.
- Rotate any key that appears in logs or Git history.
