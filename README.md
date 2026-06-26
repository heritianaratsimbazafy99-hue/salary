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

After starting the dev server, run `npm run test:e2e`.
