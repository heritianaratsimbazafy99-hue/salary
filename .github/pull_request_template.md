## Summary

-

## Verification

- [ ] `npm run verify:ci`
- [ ] `supabase start`
- [ ] `npm run db:reset:local`
- [ ] `npm run test:e2e`
- [ ] `npm run db:advisors`

## Release Readiness

- [ ] No secrets or production credentials were committed.
- [ ] Protected payroll/auth/export flows were tested or are not affected.
- [ ] Database migration impact is documented, including rollback/restore notes.
- [ ] Resend delivery remains intentionally excluded or was tested separately.
- [ ] Monitoring changes are intentionally excluded from this PR or documented separately.
