# PDF Export Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, auditable PDF payslip exports without weakening the current CSV export guarantees.

**Architecture:** Keep CSV exports as the lightweight tabular export path and introduce PDF as a separate document-rendering path. Build a shared payslip document view model so employee UI, CSV, and PDF use the same source data while each endpoint keeps its own authorization boundary and audit event.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS, Vitest, Playwright, a server-side PDF renderer to be selected during implementation.

---

## Current Code Findings

- `src/lib/payroll/export.ts` supports only CSV import reports and published payslip CSV rows.
- `src/app/api/exports/route.ts` returns `text/csv` and creates an `export_jobs` audit record after role/agency authorization.
- `src/app/api/employee/payslips/export/route.ts` returns an employee-scoped CSV from `loadEmployeePayslips`.
- `src/components/payslips/PayslipView.tsx` already has the visual data needed for a single payslip document.
- `src/app/employee/payslips/page.tsx` exposes only `Télécharger CSV`.
- The spec now documents CSV as the MVP path and explicitly excludes PDF from the current functional gate.

## Renderer Decision

Make the renderer decision before implementation:

- Prefer `@react-pdf/renderer` if the team wants React-authored payslip layouts and can accept the dependency size.
- Prefer `pdf-lib` if the team wants a minimal dependency and programmatic drawing.
- Reject browser screenshot/print-to-PDF for the secure server export path because it adds browser runtime complexity, harder deterministic tests, and larger CI surface.

Document the final choice in this plan before coding.

## Task 1: Shared Payslip Document Model

**Files:**

- Create: `src/lib/payslips/document-model.ts`
- Modify: `src/lib/payslips/employee.ts`
- Test: `src/test/unit/payslip-document-model.test.ts`

- [ ] Create a `PayslipDocumentModel` type with company label, employee identity, period, gross, deductions, net, pay items, and publication date.
- [ ] Add a pure mapper from `EmployeePayslip` to `PayslipDocumentModel`.
- [ ] Test numeric values, labels, dates, and empty pay item handling.
- [ ] Keep this model free of React, Supabase clients, and PDF renderer imports.

## Task 2: Single Employee PDF Endpoint

**Files:**

- Create: `src/app/api/employee/payslips/[payslipId]/pdf/route.ts`
- Create: `src/lib/payslips/pdf.ts`
- Modify: `src/lib/payslips/employee.ts`
- Test: `src/test/integration/employee-payslip-pdf-route.test.ts`

- [ ] Add a loader that fetches one payslip by id for the authenticated employee only.
- [ ] Return `401` for anonymous requests and `403` for non-employee profiles.
- [ ] Return `404` when the payslip id is not owned by the employee.
- [ ] Render a PDF buffer with `application/pdf` and `attachment` disposition.
- [ ] Add a PDF export audit event that excludes payroll snapshots and tokens.

## Task 3: Employee UI Download Actions

**Files:**

- Modify: `src/app/employee/payslips/page.tsx`
- Modify: `src/components/payslips/PayslipView.tsx`
- Test: `src/test/unit/employee-payslips-page.test.tsx`

- [ ] Add a per-payslip `Télécharger PDF` link beside the existing CSV link.
- [ ] Keep CSV history export available.
- [ ] Disable or hide the PDF action when there is no current payslip.
- [ ] Test link hrefs and labels.

## Task 4: HR Published Payslip PDF Export

**Files:**

- Modify: `src/lib/payroll/export.ts`
- Modify: `src/app/api/exports/route.ts`
- Test: `src/test/integration/export-flow.test.ts`
- E2E: `tests/e2e/authenticated-payroll.spec.ts`

- [ ] Extend export input with `format: "csv" | "pdf"` while defaulting to CSV for backward compatibility.
- [ ] Allow HR central and super admin to export published payslips as PDF.
- [ ] Keep agency managers denied for published payslip PDF exports unless a later product decision explicitly allows agency-scoped PDFs.
- [ ] Store export jobs with metadata indicating format.
- [ ] Return `application/pdf` for single-document PDF or `application/zip` if batch PDF export is selected.

## Task 5: Verification And Release Gate

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `docs/verification/production-readiness.md`
- Modify: `docs/security/mvp-security-review.md`

- [ ] Add PDF endpoint unit/integration tests to `npm run verify`.
- [ ] Add E2E coverage for employee PDF download response headers.
- [ ] Run `npm run verify:ci`.
- [ ] Run `supabase start`, `npm run db:reset:local`, `npm run test:e2e`, and `npm run db:advisors`.
- [ ] Update security review with the selected renderer, dependency audit result, and PDF authorization evidence.

## Acceptance Criteria

- Employees can download only their own payslip PDF.
- HR central and super admin PDF exports are scoped and audited.
- Agency managers cannot access cross-agency or employee-only PDF documents.
- PDF generation never requires exposing service-role credentials to the browser.
- CSV exports remain unchanged and backward compatible.
- CI blocks changes if PDF authorization or document generation tests fail.
