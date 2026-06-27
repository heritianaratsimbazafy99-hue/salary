# Resend Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Resend a required production dependency for payroll notification delivery and remove the previous launch exclusion.

**Architecture:** Keep email rendering separate from server delivery. Enforce Resend readiness through the production env verifier and health endpoint, then configure the external providers without committing secrets.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel environment variables, Supabase Auth SMTP, Resend Node SDK/SMTP.

---

### Task 1: Production Env Gate

**Files:**
- Modify: `scripts/verify-prod-env.mjs`
- Modify: `src/test/unit/prod-env.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

- [ ] **Step 1: Update the failing tests**

Change the valid test env to include:

```ts
RESEND_API_KEY: ["re", "placeholder_key_for_tests_only_123456"].join("_"),
RESEND_FROM_EMAIL: "MadajobPay <no-reply@salary.example.com>",
```

Rename the acceptance test to `accepts the complete production environment including Resend`, then add tests that fail when `RESEND_API_KEY` is empty, when it does not start with `re_`, and when `RESEND_FROM_EMAIL` is still `no-reply@example.com`.

- [ ] **Step 2: Make the verifier require Resend**

Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to the required production variables. Validate that the key looks like a Resend key (`re_...`), that the from email is parseable either as `Name <address>` or a raw email, and that it is not `example.com` or `onboarding@resend.dev`.

- [ ] **Step 3: Update env templates**

Keep values empty in `.env.production.example` except a realistic sender placeholder, and remove wording that says Resend is excluded.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- src/test/unit/prod-env.test.ts
npm run verify:prod-env
```

The first command must pass. The second is expected to fail locally unless real production env vars are loaded.

### Task 2: Health Endpoint Email Readiness

**Files:**
- Modify: `src/app/api/health/route.ts`
- Create: `src/test/unit/health.test.ts`

- [ ] **Step 1: Add health tests**

Test these cases:

```ts
// Resend configured + Supabase ok => 200, status ok, email configured
// Resend missing + Supabase ok => 503, status degraded, email missing
// Resend configured + Supabase error => 503, status degraded, supabase error
```

- [ ] **Step 2: Update the route**

Replace the hard-coded `email: "resend_excluded"` with an email check that returns `configured` only when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both non-empty. Return `status: "degraded"` and HTTP `503` when email is missing or Supabase is failing.

- [ ] **Step 3: Verify**

Run:

```bash
npm run test -- src/test/unit/health.test.ts
```

### Task 3: Launch Documentation

**Files:**
- Modify: `docs/verification/production-readiness.md`
- Modify: `docs/verification/launch-runbook.md`
- Modify: `docs/operations/supabase-backup-restore.md`
- Modify: `docs/verification/mvp-verification.md`

- [ ] **Step 1: Remove the Resend exclusion**

State that production requires Resend app delivery and Supabase Auth SMTP. The health endpoint should now report `email: "configured"` when ready.

- [ ] **Step 2: Add external setup facts**

Document Resend SMTP for Supabase Auth: host `smtp.resend.com`, port `465`, username `resend`, password `RESEND_API_KEY`, sender name `MadajobPay`, and a verified sender domain.

- [ ] **Step 3: Keep remaining caveats accurate**

Do not claim DNS is complete unless a verified domain is confirmed in Resend.

### Task 4: External Secrets And Provider Setup

**Files:**
- No tracked file may contain secret values.

- [ ] **Step 1: Resend dashboard**

Use the connected Chrome session to verify an active Resend account, create a restricted production API key if needed, and confirm whether at least one sending domain is verified.

- [ ] **Step 2: Vercel**

Set `RESEND_API_KEY` as a sensitive Production and Preview variable. Set `RESEND_FROM_EMAIL` for Production and Preview using a verified Resend sender. Re-pull local env only if needed, without committing it.

- [ ] **Step 3: Supabase**

If a verified sending domain exists, configure Supabase Auth SMTP with Resend credentials. If the available tooling cannot set Auth SMTP directly, use the Supabase dashboard or document the remaining dashboard/API action precisely.

- [ ] **Step 4: Smoke**

Run a non-sensitive Resend smoke email from the verified sender to an authorized test recipient, or record the exact blocker if domain verification/DNS prevents it.

### Task 5: Final Verification And Release

**Files:**
- Commit all tracked code/docs/test changes.

- [ ] **Step 1: Local verification**

Run:

```bash
npm run check:secrets
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

- [ ] **Step 2: GitHub/Vercel**

Push `codex/resend-production`, open a PR, wait for required checks, then merge to `main` if checks pass and no external blocker remains.
