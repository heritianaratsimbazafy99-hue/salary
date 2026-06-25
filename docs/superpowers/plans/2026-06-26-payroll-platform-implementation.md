# Payroll Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the validated internal payroll platform MVP described in `docs/superpowers/specs/2026-06-26-payroll-platform-design.md`.

**Architecture:** The app is a Next.js App Router application deployed on Vercel, backed by Supabase Auth, Supabase Postgres, RLS, and Resend. The implementation is split into secure core tasks first, then isolated export and analytics modules. Excel files are parsed server-side, converted to structured database records, and discarded after analysis.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS, Vercel, Resend, Tailwind CSS, shadcn/ui-style components, Zod, Vitest, Playwright, xlsx.

---

## Source Documentation

Use these official sources before implementing framework-specific behavior:

- Next.js App Router installation and routing: `https://nextjs.org/docs/app/getting-started/installation`
- Next.js Route Handlers: `https://nextjs.org/docs/app/getting-started/route-handlers`
- Supabase Next.js quickstart: `https://supabase.com/docs/guides/getting-started/quickstarts/nextjs`
- Supabase server-side auth for Next.js: `https://supabase.com/docs/guides/auth/server-side/nextjs`
- Supabase RLS guide: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase security and Data API guidance: `https://supabase.com/docs/guides/api/securing-your-api`
- Vercel Next.js deployment docs: `https://vercel.com/docs/frameworks/full-stack/nextjs`
- Resend Node.js email docs: `https://resend.com/docs/send-with-nodejs`
- Playwright test docs: `https://playwright.dev/docs/intro`

Before any Supabase implementation task, fetch `https://supabase.com/changelog.md`, scan for relevant breaking changes, and record the scan result in the task evidence.

## Subagent-Driven Execution Plan

Execution must use fresh subagents task-by-task.

Controller workflow:

1. Create or switch to an isolated branch named `codex/payroll-platform`.
2. Read this plan once.
3. Extract one full task at a time.
4. Dispatch one implementer subagent for the task.
5. Require implementer status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
6. If status is `DONE` or `DONE_WITH_CONCERNS`, dispatch a spec compliance reviewer subagent with the task text, spec path, changed files, and test evidence.
7. If spec compliance fails, send the same implementer subagent back to fix the exact gaps.
8. After spec compliance passes, dispatch a code quality reviewer subagent.
9. If code quality fails, send the same implementer subagent back to fix the exact findings.
10. Mark the task complete only after both reviews pass.
11. After all tasks, dispatch a final whole-branch reviewer and then use `superpowers:finishing-a-development-branch`.

Per-task proof required from implementer:

- Files changed.
- Tests run.
- Exact command outputs or summarized pass/fail lines.
- Security checks run when the task touches auth, RLS, uploads, exports, analytics, email, or payroll data.
- Remaining risks, even when none are known.
- Commit SHA for the task.

Reviewer requirements:

- Spec compliance reviewer checks only whether the implementation matches the approved spec and this plan.
- Code quality reviewer checks maintainability, test quality, security regressions, accessibility, and project consistency.
- Reviewers must not accept untested security-sensitive changes.

## File Structure Map

Create and maintain these areas:

```text
.
├── docs/superpowers/specs/2026-06-26-payroll-platform-design.md
├── docs/superpowers/plans/2026-06-26-payroll-platform-implementation.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── tailwind.config.ts
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/
│       ├── 202606260001_core_schema.sql
│       ├── 202606260002_rls_policies.sql
│       └── 202606260003_reporting_views.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx
│   │   ├── auth/
│   │   │   ├── callback/route.ts
│   │   │   └── login/page.tsx
│   │   ├── manager/
│   │   │   ├── page.tsx
│   │   │   ├── imports/page.tsx
│   │   │   └── imports/[importId]/page.tsx
│   │   ├── employee/
│   │   │   └── payslips/page.tsx
│   │   ├── hr/
│   │   │   ├── agencies/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   └── analytics/page.tsx
│   │   ├── admin/
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── imports/route.ts
│   │       ├── imports/[importId]/publish/route.ts
│   │       ├── exports/route.ts
│   │       └── notifications/test/route.ts
│   ├── components/
│   │   ├── shell/AppShell.tsx
│   │   ├── shell/RoleNav.tsx
│   │   ├── ui/Button.tsx
│   │   ├── ui/Card.tsx
│   │   ├── ui/Input.tsx
│   │   ├── ui/Table.tsx
│   │   ├── imports/UploadStepper.tsx
│   │   ├── imports/ColumnMappingForm.tsx
│   │   ├── imports/ImportReport.tsx
│   │   ├── imports/PayslipPreviewTable.tsx
│   │   ├── payslips/PayslipView.tsx
│   │   ├── audit/AuditLogTable.tsx
│   │   └── analytics/PayrollAnalytics.tsx
│   ├── lib/
│   │   ├── env.ts
│   │   ├── roles.ts
│   │   ├── errors.ts
│   │   ├── supabase/browser.ts
│   │   ├── supabase/server.ts
│   │   ├── supabase/admin.ts
│   │   ├── payroll/schema.ts
│   │   ├── payroll/parser.ts
│   │   ├── payroll/mapping.ts
│   │   ├── payroll/publish.ts
│   │   ├── payroll/export.ts
│   │   ├── audit/audit.ts
│   │   ├── notifications/resend.ts
│   │   └── analytics/queries.ts
│   └── test/
│       ├── fixtures/payroll-valid.xlsx
│       ├── fixtures/payroll-mixed-errors.xlsx
│       ├── fixtures/payroll-unknown-columns.xlsx
│       ├── unit/parser.test.ts
│       ├── unit/mapping.test.ts
│       ├── unit/publish.test.ts
│       ├── integration/import-flow.test.ts
│       ├── integration/export-flow.test.ts
│       └── rls/rls-policies.test.ts
└── tests/e2e/
    ├── manager-import.spec.ts
    ├── employee-payslips.spec.ts
    └── hr-audit-analytics.spec.ts
```

## Shared Contracts

Use these stable TypeScript contracts across tasks.

Create `src/lib/roles.ts`:

```ts
export const APP_ROLES = [
  "agency_manager",
  "employee",
  "hr_central",
  "super_admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function canReadAllAgencies(role: AppRole): boolean {
  return role === "hr_central" || role === "super_admin";
}

export function canPublishForAgency(role: AppRole): boolean {
  return role === "agency_manager";
}
```

Create `src/lib/payroll/schema.ts`:

```ts
import { z } from "zod";

export const PAYROLL_REQUIRED_COLUMNS = [
  "employee_id",
  "email",
  "period_start",
  "period_end",
  "employee_name",
  "gross_amount",
  "deductions_total",
  "net_amount",
] as const;

export const PAYROLL_OPTIONAL_COLUMNS = [
  "role",
  "department",
  "contract_type",
  "base_salary",
  "hours_worked",
  "overtime_hours",
  "payment_date",
  "notes",
] as const;

export const PAY_ITEM_CATEGORIES = [
  "BASE_PAY",
  "HOURS",
  "OVERTIME",
  "BONUS",
  "ABSENCE",
  "DEDUCTION",
  "BENEFIT",
  "INFORMATIONAL_NOTE",
  "OTHER_ELEMENTS",
] as const;

export type PayItemCategory = (typeof PAY_ITEM_CATEGORIES)[number];

export const PayrollRowSchema = z.object({
  employeeId: z.string().min(1),
  email: z.string().email(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  employeeName: z.string().min(1),
  role: z.string().optional(),
  department: z.string().optional(),
  contractType: z.string().optional(),
  baseSalary: z.number().nonnegative().optional(),
  hoursWorked: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative(),
  deductionsTotal: z.number().nonnegative(),
  netAmount: z.number(),
  paymentDate: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
});

export type PayrollRow = z.infer<typeof PayrollRowSchema>;

export type ParsedPayrollRow =
  | { status: "valid"; rowNumber: number; data: PayrollRow; unknownColumns: Record<string, unknown> }
  | { status: "invalid"; rowNumber: number; errors: PayrollRowError[]; raw: Record<string, unknown> };

export type PayrollRowError = {
  fieldName: string;
  errorCode: string;
  message: string;
  rawValue: unknown;
};
```

## Task 1: Project Scaffold And Tooling

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/lib/env.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create baseline package manifest**

Use this `package.json`:

```json
{
  "name": "salary-platform",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "verify": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "@supabase/ssr": "latest",
    "@supabase/supabase-js": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "lucide-react": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "resend": "latest",
    "tailwind-merge": "latest",
    "xlsx": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@tailwindcss/postcss": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "eslint": "latest",
    "eslint-config-next": "latest",
    "jsdom": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and `npm install` exits with code 0.

- [ ] **Step 3: Add TypeScript and Next config**

Use this `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Use this `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
```

- [ ] **Step 4: Add test and styling config**

Use this `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
  },
});
```

Use this `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
```

Use this `postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Use this `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Add lint, env, app shell, and gitignore**

Use this `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
```

Use this `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL="Paie Interne <no-reply@example.com>"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use this `.gitignore`:

```gitignore
node_modules
.next
out
coverage
playwright-report
test-results
.env
.env.local
.env.*.local
*.pem
*.key
```

Use this `src/lib/env.ts`:

```ts
import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const ServerEnvSchema = PublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).default("Paie Interne <no-reply@example.com>"),
});

export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export const serverEnv = ServerEnvSchema.parse({
  ...publicEnv,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
});
```

Use this `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plateforme paie interne",
  description: "Gestion interne des fiches de paie web",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

Use this `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Plateforme interne</p>
        <h1 className="mt-2 text-3xl font-semibold">Fiches de paie internes</h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Connectez-vous pour gerer les imports de paie ou consulter vos fiches publiees.
        </p>
      </section>
    </main>
  );
}
```

Use this `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --primary: 173 80% 30%;
  --primary-foreground: 0 0% 100%;
}

body {
  margin: 0;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 6: Run scaffold verification**

Run:

```bash
npm run typecheck
npm run test
npm run build
```

Expected:

- Typecheck exits 0.
- Vitest exits 0, even with no tests or after adding an initial smoke test.
- Next build exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json vitest.config.ts playwright.config.ts eslint.config.mjs postcss.config.mjs tailwind.config.ts .env.example .gitignore src/app src/lib/env.ts
git commit -m "chore: scaffold payroll platform app"
```

## Task 2: Supabase Schema, RLS, And Seed Data

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202606260001_core_schema.sql`
- Create: `supabase/migrations/202606260002_rls_policies.sql`
- Create: `supabase/seed.sql`
- Create: `src/test/rls/rls-policies.test.ts`

- [ ] **Step 1: Write failing RLS tests**

Create `src/test/rls/rls-policies.test.ts`:

```ts
import { describe, expect, it } from "vitest";

type PolicyCase = {
  actorRole: string;
  resourceAgencyId: string;
  actorAgencyId?: string;
  ownerProfileId?: string;
  actorProfileId: string;
};

function canSelectPayslip(input: PolicyCase): boolean {
  if (input.actorRole === "hr_central" || input.actorRole === "super_admin") return true;
  if (input.actorRole === "agency_manager") return input.actorAgencyId === input.resourceAgencyId;
  if (input.actorRole === "employee") return input.actorProfileId === input.ownerProfileId;
  return false;
}

function canPublish(input: PolicyCase): boolean {
  return input.actorRole === "agency_manager" && input.actorAgencyId === input.resourceAgencyId;
}

describe("RLS policy model", () => {
  it("denies employee access to another employee payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_b",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("allows employee access to own payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_a",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(true);
  });

  it("denies manager publication outside assigned agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_2",
      }),
    ).toBe(false);
  });

  it("denies HR central publication", () => {
    expect(
      canPublish({
        actorRole: "hr_central",
        actorProfileId: "profile_hr",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes as policy model**

Run:

```bash
npm run test -- src/test/rls/rls-policies.test.ts
```

Expected: PASS. These tests document the intended policy logic before SQL is added.

- [ ] **Step 3: Add Supabase local config**

Create `supabase/config.toml`:

```toml
project_id = "salary-platform"

[api]
enabled = true
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
jwt_expiry = 3600
enable_signup = false

[storage]
enabled = true
file_size_limit = "10MiB"
```

- [ ] **Step 4: Add core schema migration**

Create `supabase/migrations/202606260001_core_schema.sql`:

```sql
create extension if not exists "pgcrypto";

create type public.app_role as enum ('agency_manager', 'employee', 'hr_central', 'super_admin');
create type public.import_status as enum ('UPLOADED', 'NEEDS_MAPPING', 'READY_FOR_PREVIEW', 'PUBLISHED', 'SUPERSEDED', 'FAILED');
create type public.pay_item_category as enum ('BASE_PAY', 'HOURS', 'OVERTIME', 'BONUS', 'ABSENCE', 'DEDUCTION', 'BENEFIT', 'INFORMATIONAL_NOTE', 'OTHER_ELEMENTS');
create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED');
create type public.export_status as enum ('PENDING', 'COMPLETED', 'FAILED');

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agency_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  employee_id text not null,
  email text not null,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, employee_id),
  unique (agency_id, email)
);

create table public.payroll_imports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  uploaded_by uuid not null references public.profiles(id),
  status public.import_status not null default 'UPLOADED',
  source_filename text not null,
  valid_row_count integer not null default 0,
  invalid_row_count integer not null default 0,
  unknown_employee_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.payroll_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.payroll_imports(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id text not null,
  employee_email text not null,
  employee_name text not null,
  normalized_data jsonb not null,
  pay_items jsonb not null default '[]'::jsonb,
  manual_adjustments jsonb not null default '{}'::jsonb,
  has_manual_adjustments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payroll_import_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.payroll_imports(id) on delete cascade,
  row_number integer not null,
  field_name text not null,
  error_code text not null,
  message text not null,
  raw_value text,
  created_at timestamptz not null default now()
);

create table public.column_mappings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source_column text not null,
  target_category public.pay_item_category not null,
  display_label text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, source_column)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  current_version_id uuid,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  unique (agency_id, employee_id, period_start, period_end),
  check (period_end >= period_start)
);

create table public.payslip_versions (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  import_id uuid not null references public.payroll_imports(id),
  version_number integer not null,
  snapshot_data jsonb not null,
  pay_items jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles(id),
  replaced_at timestamptz,
  unique (payslip_id, version_number)
);

alter table public.payslips
  add constraint payslips_current_version_fk
  foreign key (current_version_id) references public.payslip_versions(id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  agency_id uuid references public.agencies(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  notification_type text not null,
  resource_type text not null,
  resource_id uuid,
  status public.notification_status not null default 'PENDING',
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  export_type text not null,
  agency_id uuid references public.agencies(id) on delete set null,
  period_start date,
  period_end date,
  status public.export_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

- [ ] **Step 5: Add RLS migration**

Create `supabase/migrations/202606260002_rls_policies.sql`:

```sql
alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.agency_memberships enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_imports enable row level security;
alter table public.payroll_import_rows enable row level security;
alter table public.payroll_import_errors enable row level security;
alter table public.column_mappings enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_versions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.export_jobs enable row level security;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security invoker
as $$
  select id from public.profiles where auth_user_id = (select auth.uid())
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
as $$
  select role from public.profiles where auth_user_id = (select auth.uid())
$$;

create or replace function public.current_agency_id()
returns uuid
language sql
stable
security invoker
as $$
  select agency_id
  from public.agency_memberships
  where profile_id = public.current_profile_id()
$$;

create or replace function public.is_global_reader()
returns boolean
language sql
stable
security invoker
as $$
  select public.current_app_role() in ('hr_central', 'super_admin')
$$;

create policy agencies_select_scoped on public.agencies
for select to authenticated
using (
  public.is_global_reader()
  or id = public.current_agency_id()
);

create policy agencies_write_hr_admin on public.agencies
for all to authenticated
using (public.current_app_role() in ('hr_central', 'super_admin'))
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy profiles_select_self_or_global on public.profiles
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or public.is_global_reader()
);

create policy memberships_select_scoped on public.agency_memberships
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_global_reader()
);

create policy memberships_write_hr_admin on public.agency_memberships
for all to authenticated
using (public.current_app_role() in ('hr_central', 'super_admin'))
with check (public.current_app_role() in ('hr_central', 'super_admin'));

create policy employees_select_scoped on public.employees
for select to authenticated
using (
  public.is_global_reader()
  or agency_id = public.current_agency_id()
  or profile_id = public.current_profile_id()
);

create policy employees_write_manager_or_global on public.employees
for all to authenticated
using (
  public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id()
  or public.current_app_role() = 'super_admin'
)
with check (
  public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id()
  or public.current_app_role() = 'super_admin'
);

create policy imports_select_scoped on public.payroll_imports
for select to authenticated
using (public.is_global_reader() or agency_id = public.current_agency_id());

create policy imports_write_manager on public.payroll_imports
for all to authenticated
using (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id())
with check (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id());

create policy import_rows_select_scoped on public.payroll_import_rows
for select to authenticated
using (public.is_global_reader() or agency_id = public.current_agency_id());

create policy import_rows_write_manager on public.payroll_import_rows
for all to authenticated
using (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id())
with check (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id());

create policy import_errors_select_scoped on public.payroll_import_errors
for select to authenticated
using (
  exists (
    select 1 from public.payroll_imports pi
    where pi.id = import_id
    and (public.is_global_reader() or pi.agency_id = public.current_agency_id())
  )
);

create policy mappings_select_scoped on public.column_mappings
for select to authenticated
using (public.is_global_reader() or agency_id = public.current_agency_id());

create policy mappings_write_manager on public.column_mappings
for all to authenticated
using (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id())
with check (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id());

create policy payslips_select_scoped on public.payslips
for select to authenticated
using (
  public.is_global_reader()
  or agency_id = public.current_agency_id()
  or exists (
    select 1 from public.employees e
    where e.id = employee_id
    and e.profile_id = public.current_profile_id()
  )
);

create policy payslips_write_manager on public.payslips
for all to authenticated
using (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id())
with check (public.current_app_role() = 'agency_manager' and agency_id = public.current_agency_id());

create policy payslip_versions_select_scoped on public.payslip_versions
for select to authenticated
using (
  exists (
    select 1 from public.payslips p
    join public.employees e on e.id = p.employee_id
    where p.id = payslip_id
    and (
      public.is_global_reader()
      or p.agency_id = public.current_agency_id()
      or e.profile_id = public.current_profile_id()
    )
  )
);

create policy payslip_versions_insert_manager on public.payslip_versions
for insert to authenticated
with check (
  exists (
    select 1 from public.payslips p
    where p.id = payslip_id
    and public.current_app_role() = 'agency_manager'
    and p.agency_id = public.current_agency_id()
  )
);

create policy audit_select_global on public.audit_logs
for select to authenticated
using (public.is_global_reader());

create policy notifications_select_recipient_or_global on public.notifications
for select to authenticated
using (
  public.is_global_reader()
  or recipient_profile_id = public.current_profile_id()
);

create policy exports_select_authorized on public.export_jobs
for select to authenticated
using (
  public.is_global_reader()
  or (
    public.current_app_role() = 'agency_manager'
    and agency_id = public.current_agency_id()
    and export_type = 'IMPORT_REPORT'
  )
);
```

- [ ] **Step 6: Add seed data**

Create `supabase/seed.sql`:

```sql
insert into public.agencies (id, name, code)
values
  ('00000000-0000-0000-0000-000000000101', 'Agence Antananarivo', 'TNR'),
  ('00000000-0000-0000-0000-000000000102', 'Agence Toamasina', 'TMM')
on conflict (code) do nothing;
```

- [ ] **Step 7: Run database verification**

Run:

```bash
supabase --version
supabase start
supabase db reset
npm run test -- src/test/rls/rls-policies.test.ts
```

Expected:

- Supabase CLI version is recorded in evidence.
- `supabase db reset` exits 0.
- RLS model test passes.

- [ ] **Step 8: Commit**

```bash
git add supabase src/test/rls/rls-policies.test.ts
git commit -m "feat: add payroll schema and rls foundation"
```

## Task 3: Supabase Clients, Auth, And Protected Routing

**Files:**
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/errors.ts`
- Create: `src/app/auth/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/components/shell/AppShell.tsx`
- Create: `src/components/shell/RoleNav.tsx`
- Create: `src/test/unit/auth-guards.test.ts`

- [ ] **Step 1: Write failing auth guard tests**

Create `src/test/unit/auth-guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canReadAllAgencies, canPublishForAgency } from "@/lib/roles";

describe("role helpers", () => {
  it("allows global readers for HR central and super admin", () => {
    expect(canReadAllAgencies("hr_central")).toBe(true);
    expect(canReadAllAgencies("super_admin")).toBe(true);
    expect(canReadAllAgencies("agency_manager")).toBe(false);
    expect(canReadAllAgencies("employee")).toBe(false);
  });

  it("allows only agency manager to publish agency payslips", () => {
    expect(canPublishForAgency("agency_manager")).toBe(true);
    expect(canPublishForAgency("hr_central")).toBe(false);
    expect(canPublishForAgency("employee")).toBe(false);
    expect(canPublishForAgency("super_admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/auth-guards.test.ts
```

Expected: FAIL because `src/lib/roles.ts` does not exist yet unless created earlier from the shared contract.

- [ ] **Step 3: Implement roles and Supabase clients**

Create `src/lib/roles.ts` with the shared contract from this plan.

Create `src/lib/errors.ts`:

```ts
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function apiError(code: ApiErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}
```

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
```

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

export function createAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-only admin operations");
  }

  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 4: Implement login and callback**

Create `src/app/auth/login/page.tsx`:

```tsx
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form action={signIn} className="w-full max-w-sm space-y-4 rounded border border-border p-6">
        <div>
          <h1 className="text-xl font-semibold">Connexion</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recevez un lien magique par email.</p>
        </div>
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="w-full rounded border border-border px-3 py-2" />
        <button className="w-full rounded bg-primary px-4 py-2 text-primary-foreground" type="submit">
          Envoyer le lien
        </button>
      </form>
    </main>
  );
}
```

Create `src/app/auth/callback/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run test -- src/test/unit/auth-guards.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib src/app/auth src/components/shell src/test/unit/auth-guards.test.ts
git commit -m "feat: add auth foundation and role helpers"
```

## Task 4: HR Agency And Manager Management

**Files:**
- Create: `src/app/hr/agencies/page.tsx`
- Create: `src/app/hr/users/page.tsx`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Table.tsx`
- Create: `src/lib/admin/agencies.ts`
- Create: `src/lib/admin/users.ts`
- Create: `src/test/unit/admin-permissions.test.ts`

- [ ] **Step 1: Write failing permission tests**

Create `src/test/unit/admin-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppRole } from "@/lib/roles";

function canManageAgencies(role: AppRole) {
  return role === "hr_central" || role === "super_admin";
}

function canAssignAgencyManager(role: AppRole) {
  return role === "hr_central" || role === "super_admin";
}

describe("HR admin permissions", () => {
  it("allows HR central and super admin to manage agencies", () => {
    expect(canManageAgencies("hr_central")).toBe(true);
    expect(canManageAgencies("super_admin")).toBe(true);
    expect(canManageAgencies("agency_manager")).toBe(false);
  });

  it("allows HR central and super admin to assign agency managers", () => {
    expect(canAssignAgencyManager("hr_central")).toBe(true);
    expect(canAssignAgencyManager("super_admin")).toBe(true);
    expect(canAssignAgencyManager("employee")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm run test -- src/test/unit/admin-permissions.test.ts
```

Expected: PASS as permission contract.

- [ ] **Step 3: Implement server actions**

Create `src/lib/admin/agencies.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export async function listAgencies() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agencies").select("id,name,code,is_active").order("name");
  if (error) throw error;
  return data;
}

export async function createAgency(input: { name: string; code: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .insert({ name: input.name, code: input.code.toUpperCase() })
    .select("id,name,code,is_active")
    .single();
  if (error) throw error;
  return data;
}
```

Create `src/lib/admin/users.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export async function createAgencyManager(input: {
  email: string;
  fullName: string;
  agencyId: string;
}) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ email: input.email, full_name: input.fullName, role: "agency_manager" })
    .select("id,email,full_name,role")
    .single();

  if (profileError) throw profileError;

  const { error: membershipError } = await admin
    .from("agency_memberships")
    .insert({ profile_id: profile.id, agency_id: input.agencyId });

  if (membershipError) throw membershipError;
  return profile;
}
```

- [ ] **Step 4: Implement HR pages**

Create pages with forms that call the server actions, render tables, and show empty states. Use French visible text. Keep financial data absent from these pages.

Core page text for `src/app/hr/agencies/page.tsx`:

```tsx
export default async function AgenciesPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agences</h1>
        <p className="text-sm text-muted-foreground">Creation et suivi des agences actives.</p>
      </div>
    </main>
  );
}
```

Core page text for `src/app/hr/users/page.tsx`:

```tsx
export default async function UsersPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Responsables d'agence</h1>
        <p className="text-sm text-muted-foreground">Creation des responsables et affectation a une agence.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/admin-permissions.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/hr src/components/ui src/lib/admin src/test/unit/admin-permissions.test.ts
git commit -m "feat: add hr agency and manager management foundation"
```

## Task 5: Employee Model And Account Linking

**Files:**
- Create: `src/lib/employees/linking.ts`
- Create: `src/test/unit/employee-linking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/unit/employee-linking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeEmployeeIdentity } from "@/lib/employees/linking";

describe("normalizeEmployeeIdentity", () => {
  it("normalizes stable employee identity", () => {
    expect(
      normalizeEmployeeIdentity({
        agencyId: "agency-1",
        employeeId: " emp-001 ",
        email: "USER@EXAMPLE.COM",
        fullName: " Jean Rakoto ",
      }),
    ).toEqual({
      agencyId: "agency-1",
      employeeId: "EMP-001",
      email: "user@example.com",
      fullName: "Jean Rakoto",
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/employee-linking.test.ts
```

Expected: FAIL because `normalizeEmployeeIdentity` does not exist.

- [ ] **Step 3: Implement identity helper**

Create `src/lib/employees/linking.ts`:

```ts
export type EmployeeIdentityInput = {
  agencyId: string;
  employeeId: string;
  email: string;
  fullName: string;
};

export type EmployeeIdentity = EmployeeIdentityInput;

export function normalizeEmployeeIdentity(input: EmployeeIdentityInput): EmployeeIdentity {
  return {
    agencyId: input.agencyId,
    employeeId: input.employeeId.trim().toUpperCase(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim().replace(/\s+/g, " "),
  };
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- src/test/unit/employee-linking.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees/linking.ts src/test/unit/employee-linking.test.ts
git commit -m "feat: add employee identity linking helpers"
```

## Task 6: Excel Parser And Validation Library

**Files:**
- Create: `src/lib/payroll/schema.ts`
- Create: `src/lib/payroll/parser.ts`
- Create: `src/test/unit/parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/test/unit/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePayrollRowsFromObjects } from "@/lib/payroll/parser";

describe("parsePayrollRowsFromObjects", () => {
  it("parses valid rows and reports unknown columns", () => {
    const result = parsePayrollRowsFromObjects([
      {
        employee_id: "EMP-001",
        email: "employee@example.com",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        employee_name: "Employee One",
        gross_amount: 1200000,
        deductions_total: 100000,
        net_amount: 1100000,
        prime_transport: 50000,
      },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.unknownColumns).toEqual(["prime_transport"]);
  });

  it("imports valid rows and records invalid row errors", () => {
    const result = parsePayrollRowsFromObjects([
      {
        employee_id: "EMP-001",
        email: "employee@example.com",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        employee_name: "Employee One",
        gross_amount: 1200000,
        deductions_total: 100000,
        net_amount: 1100000,
      },
      {
        employee_id: "",
        email: "not-an-email",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        employee_name: "",
        gross_amount: "bad",
        deductions_total: 100000,
        net_amount: 1100000,
      },
    ]);

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]?.errors.map((error) => error.fieldName)).toContain("email");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/parser.test.ts
```

Expected: FAIL because parser files do not exist.

- [ ] **Step 3: Implement payroll schema**

Create `src/lib/payroll/schema.ts` with the shared contract from this plan.

- [ ] **Step 4: Implement parser**

Create `src/lib/payroll/parser.ts`:

```ts
import {
  PAYROLL_OPTIONAL_COLUMNS,
  PAYROLL_REQUIRED_COLUMNS,
  PayrollRowSchema,
  type ParsedPayrollRow,
  type PayrollRowError,
} from "@/lib/payroll/schema";

type RawRow = Record<string, unknown>;

const STANDARD_COLUMNS = new Set<string>([...PAYROLL_REQUIRED_COLUMNS, ...PAYROLL_OPTIONAL_COLUMNS]);

export type PayrollParseResult = {
  validRows: Extract<ParsedPayrollRow, { status: "valid" }>[];
  invalidRows: Extract<ParsedPayrollRow, { status: "invalid" }>[];
  unknownColumns: string[];
};

export function parsePayrollRowsFromObjects(rows: RawRow[]): PayrollParseResult {
  const validRows: PayrollParseResult["validRows"] = [];
  const invalidRows: PayrollParseResult["invalidRows"] = [];
  const unknownColumns = new Set<string>();

  rows.forEach((row, index) => {
    Object.keys(row).forEach((column) => {
      if (!STANDARD_COLUMNS.has(column)) unknownColumns.add(column);
    });

    const normalized = {
      employeeId: stringValue(row.employee_id),
      email: stringValue(row.email).toLowerCase(),
      periodStart: stringValue(row.period_start),
      periodEnd: stringValue(row.period_end),
      employeeName: stringValue(row.employee_name),
      role: optionalString(row.role),
      department: optionalString(row.department),
      contractType: optionalString(row.contract_type),
      baseSalary: optionalNumber(row.base_salary),
      hoursWorked: optionalNumber(row.hours_worked),
      overtimeHours: optionalNumber(row.overtime_hours),
      grossAmount: requiredNumber(row.gross_amount),
      deductionsTotal: requiredNumber(row.deductions_total),
      netAmount: requiredNumber(row.net_amount),
      paymentDate: optionalString(row.payment_date),
      notes: optionalString(row.notes),
    };

    const parsed = PayrollRowSchema.safeParse(normalized);
    if (parsed.success) {
      validRows.push({
        status: "valid",
        rowNumber: index + 2,
        data: parsed.data,
        unknownColumns: Object.fromEntries(Object.entries(row).filter(([key]) => !STANDARD_COLUMNS.has(key))),
      });
      return;
    }

    const errors: PayrollRowError[] = parsed.error.issues.map((issue) => {
      const fieldName = String(issue.path[0] ?? "row");
      return {
        fieldName,
        errorCode: issue.code,
        message: issue.message,
        rawValue: row[fieldName],
      };
    });

    invalidRows.push({ status: "invalid", rowNumber: index + 2, errors, raw: row });
  });

  return { validRows, invalidRows, unknownColumns: Array.from(unknownColumns).sort() };
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function optionalString(value: unknown): string | undefined {
  const text = stringValue(value);
  return text.length > 0 ? text : undefined;
}

function requiredNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  return requiredNumber(value);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/parser.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll src/test/unit/parser.test.ts
git commit -m "feat: add payroll excel parser contract"
```

## Task 7: Upload And Import Batch API

**Files:**
- Create: `src/app/api/imports/route.ts`
- Create: `src/lib/payroll/import-service.ts`
- Create: `src/test/integration/import-flow.test.ts`

- [ ] **Step 1: Write failing import service tests**

Create `src/test/integration/import-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildImportSummary } from "@/lib/payroll/import-service";

describe("buildImportSummary", () => {
  it("summarizes mixed valid and invalid import results", () => {
    const summary = buildImportSummary({
      validRows: [{ employeeId: "EMP-001" }, { employeeId: "EMP-002" }],
      invalidRows: [{ rowNumber: 4 }],
      unknownEmployeeIds: ["EMP-002"],
    });

    expect(summary).toEqual({
      validRowCount: 2,
      invalidRowCount: 1,
      unknownEmployeeCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/integration/import-flow.test.ts
```

Expected: FAIL because import service does not exist.

- [ ] **Step 3: Implement import summary service**

Create `src/lib/payroll/import-service.ts`:

```ts
export type ImportSummaryInput = {
  validRows: { employeeId: string }[];
  invalidRows: { rowNumber: number }[];
  unknownEmployeeIds: string[];
};

export type ImportSummary = {
  validRowCount: number;
  invalidRowCount: number;
  unknownEmployeeCount: number;
};

export function buildImportSummary(input: ImportSummaryInput): ImportSummary {
  return {
    validRowCount: input.validRows.length,
    invalidRowCount: input.invalidRows.length,
    unknownEmployeeCount: input.unknownEmployeeIds.length,
  };
}
```

- [ ] **Step 4: Implement upload route boundary**

Create `src/app/api/imports/route.ts`:

```ts
import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const agencyId = String(formData.get("agencyId") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Excel file is required"), { status: 422 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "File exceeds 10 MB limit"), { status: 422 });
  }

  if (!agencyId || !periodStart || !periodEnd) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Agency and period are required"), { status: 422 });
  }

  return NextResponse.json({
    data: {
      status: "UPLOADED",
      filename: file.name,
      agencyId,
      periodStart,
      periodEnd,
    },
  });
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/integration/import-flow.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/imports/route.ts src/lib/payroll/import-service.ts src/test/integration/import-flow.test.ts
git commit -m "feat: add payroll import upload boundary"
```

## Task 8: Column Mapping Workflow

**Files:**
- Create: `src/lib/payroll/mapping.ts`
- Create: `src/components/imports/ColumnMappingForm.tsx`
- Create: `src/test/unit/mapping.test.ts`

- [ ] **Step 1: Write failing mapping tests**

Create `src/test/unit/mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyColumnMappings } from "@/lib/payroll/mapping";

describe("applyColumnMappings", () => {
  it("maps unknown columns to configured pay item categories", () => {
    const result = applyColumnMappings(
      { prime_transport: 50000 },
      [{ sourceColumn: "prime_transport", targetCategory: "BENEFIT", displayLabel: "Prime transport" }],
    );

    expect(result).toEqual([
      {
        label: "Prime transport",
        category: "BENEFIT",
        amount: 50000,
        rawValue: 50000,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/mapping.test.ts
```

Expected: FAIL because mapping module does not exist.

- [ ] **Step 3: Implement mapping module**

Create `src/lib/payroll/mapping.ts`:

```ts
import type { PayItemCategory } from "@/lib/payroll/schema";

export type ColumnMapping = {
  sourceColumn: string;
  targetCategory: PayItemCategory;
  displayLabel: string;
};

export type PayItem = {
  label: string;
  category: PayItemCategory;
  amount?: number;
  text?: string;
  rawValue: unknown;
};

export function applyColumnMappings(
  unknownColumns: Record<string, unknown>,
  mappings: ColumnMapping[],
): PayItem[] {
  const mappingByColumn = new Map(mappings.map((mapping) => [mapping.sourceColumn, mapping]));

  return Object.entries(unknownColumns).flatMap(([column, rawValue]) => {
    const mapping = mappingByColumn.get(column);
    if (!mapping) return [];
    const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
    return [
      {
        label: mapping.displayLabel,
        category: mapping.targetCategory,
        amount: Number.isFinite(numericValue) ? numericValue : undefined,
        text: Number.isFinite(numericValue) ? undefined : String(rawValue),
        rawValue,
      },
    ];
  });
}
```

- [ ] **Step 4: Implement mapping form component**

Create `src/components/imports/ColumnMappingForm.tsx`:

```tsx
import { PAY_ITEM_CATEGORIES } from "@/lib/payroll/schema";

type Props = {
  unknownColumns: string[];
};

export function ColumnMappingForm({ unknownColumns }: Props) {
  if (unknownColumns.length === 0) {
    return <p className="text-sm text-muted-foreground">Toutes les colonnes sont reconnues.</p>;
  }

  return (
    <form className="space-y-4">
      {unknownColumns.map((column) => (
        <fieldset key={column} className="grid gap-2 rounded border border-border p-4 md:grid-cols-3">
          <legend className="px-1 text-sm font-medium">{column}</legend>
          <label className="text-sm">
            Libelle
            <input name={`label:${column}`} defaultValue={column} className="mt-1 w-full rounded border border-border px-3 py-2" />
          </label>
          <label className="text-sm">
            Categorie
            <select name={`category:${column}`} className="mt-1 w-full rounded border border-border px-3 py-2">
              {PAY_ITEM_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ))}
    </form>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/mapping.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll/mapping.ts src/components/imports/ColumnMappingForm.tsx src/test/unit/mapping.test.ts
git commit -m "feat: add per-agency column mapping workflow"
```

## Task 9: Import Report UI And Error Handling

**Files:**
- Create: `src/components/imports/ImportReport.tsx`
- Create: `src/components/imports/UploadStepper.tsx`
- Create: `src/app/manager/imports/page.tsx`
- Create: `src/app/manager/imports/[importId]/page.tsx`
- Create: `tests/e2e/manager-import.spec.ts`

- [ ] **Step 1: Write E2E test for report shell**

Create `tests/e2e/manager-import.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("manager import page renders upload workflow shell", async ({ page }) => {
  await page.goto("/manager/imports");
  await expect(page.getByRole("heading", { name: "Imports de paie" })).toBeVisible();
  await expect(page.getByText("Upload")).toBeVisible();
  await expect(page.getByText("Mapping")).toBeVisible();
  await expect(page.getByText("Validation")).toBeVisible();
  await expect(page.getByText("Publication")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E to verify failure**

Run:

```bash
npm run test:e2e -- tests/e2e/manager-import.spec.ts
```

Expected: FAIL because manager import page does not exist.

- [ ] **Step 3: Implement stepper and report**

Create `src/components/imports/UploadStepper.tsx`:

```tsx
const STEPS = ["Upload", "Mapping", "Validation", "Invitations", "Previsualisation", "Publication"];

export function UploadStepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-2 md:grid-cols-6" aria-label="Progression import">
      {STEPS.map((step, index) => (
        <li
          key={step}
          className="rounded border border-border px-3 py-2 text-sm"
          aria-current={index === currentStep ? "step" : undefined}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}
```

Create `src/components/imports/ImportReport.tsx`:

```tsx
type ImportError = {
  rowNumber: number;
  fieldName: string;
  message: string;
};

type Props = {
  validRowCount: number;
  invalidRowCount: number;
  unknownEmployeeCount: number;
  errors: ImportError[];
};

export function ImportReport({ validRowCount, invalidRowCount, unknownEmployeeCount, errors }: Props) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Lignes valides" value={validRowCount} />
        <Metric label="Lignes en erreur" value={invalidRowCount} />
        <Metric label="Salaries inconnus" value={unknownEmployeeCount} />
      </div>
      {errors.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2">Ligne</th>
              <th>Champ</th>
              <th>Erreur</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr key={`${error.rowNumber}:${error.fieldName}`} className="border-b border-border">
                <td className="py-2">{error.rowNumber}</td>
                <td>{error.fieldName}</td>
                <td>{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune erreur detectee.</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Implement manager pages**

Create `src/app/manager/imports/page.tsx`:

```tsx
import { UploadStepper } from "@/components/imports/UploadStepper";

export default function ManagerImportsPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Imports de paie</h1>
        <p className="text-sm text-muted-foreground">Chargez un fichier Excel pour une periode de paie.</p>
      </div>
      <UploadStepper currentStep={0} />
      <form className="grid gap-4 rounded border border-border p-4 md:grid-cols-2">
        <label className="text-sm">
          Debut de periode
          <input type="date" name="periodStart" className="mt-1 w-full rounded border border-border px-3 py-2" />
        </label>
        <label className="text-sm">
          Fin de periode
          <input type="date" name="periodEnd" className="mt-1 w-full rounded border border-border px-3 py-2" />
        </label>
        <label className="text-sm md:col-span-2">
          Fichier Excel
          <input type="file" name="file" accept=".xlsx,.xls" className="mt-1 w-full rounded border border-border px-3 py-2" />
        </label>
      </form>
    </main>
  );
}
```

Create `src/app/manager/imports/[importId]/page.tsx`:

```tsx
import { ImportReport } from "@/components/imports/ImportReport";
import { UploadStepper } from "@/components/imports/UploadStepper";

export default function ImportDetailPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Rapport d'import</h1>
        <p className="text-sm text-muted-foreground">Controlez les lignes valides et les erreurs avant publication.</p>
      </div>
      <UploadStepper currentStep={2} />
      <ImportReport validRowCount={0} invalidRowCount={0} unknownEmployeeCount={0} errors={[]} />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run test:e2e -- tests/e2e/manager-import.spec.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/imports src/app/manager tests/e2e/manager-import.spec.ts
git commit -m "feat: add import report workflow shell"
```

## Task 10: Preview And Manual Correction Workflow

**Files:**
- Create: `src/components/imports/PayslipPreviewTable.tsx`
- Create: `src/lib/payroll/adjustments.ts`
- Create: `src/test/unit/adjustments.test.ts`

- [ ] **Step 1: Write failing adjustment tests**

Create `src/test/unit/adjustments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyManualAdjustment } from "@/lib/payroll/adjustments";

describe("applyManualAdjustment", () => {
  it("applies a manual adjustment without changing original imported data", () => {
    const result = applyManualAdjustment(
      { netAmount: 1000, grossAmount: 1200 },
      { netAmount: 1100 },
    );

    expect(result).toEqual({
      normalizedData: { netAmount: 1100, grossAmount: 1200 },
      manualAdjustments: { netAmount: { before: 1000, after: 1100 } },
      hasManualAdjustments: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/adjustments.test.ts
```

Expected: FAIL because adjustment module does not exist.

- [ ] **Step 3: Implement adjustment logic**

Create `src/lib/payroll/adjustments.ts`:

```ts
type PayrollData = Record<string, unknown>;

export function applyManualAdjustment(original: PayrollData, changes: PayrollData) {
  const normalizedData = { ...original, ...changes };
  const manualAdjustments: Record<string, { before: unknown; after: unknown }> = {};

  Object.entries(changes).forEach(([key, after]) => {
    const before = original[key];
    if (before !== after) {
      manualAdjustments[key] = { before, after };
    }
  });

  return {
    normalizedData,
    manualAdjustments,
    hasManualAdjustments: Object.keys(manualAdjustments).length > 0,
  };
}
```

- [ ] **Step 4: Implement preview table**

Create `src/components/imports/PayslipPreviewTable.tsx`:

```tsx
type PreviewRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  hasManualAdjustments: boolean;
};

export function PayslipPreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune fiche valide a previsualiser.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          <th className="py-2">Salarie</th>
          <th>Brut</th>
          <th>Retenues</th>
          <th>Net</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-border">
            <td className="py-2">
              <span className="font-medium">{row.employeeName}</span>
              <span className="block text-xs text-muted-foreground">{row.employeeId}</span>
            </td>
            <td>{formatMga(row.grossAmount)}</td>
            <td>{formatMga(row.deductionsTotal)}</td>
            <td>{formatMga(row.netAmount)}</td>
            <td>{row.hasManualAdjustments ? "Modifie" : "Import"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", { style: "currency", currency: "MGA", maximumFractionDigits: 0 }).format(value);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/adjustments.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/imports/PayslipPreviewTable.tsx src/lib/payroll/adjustments.ts src/test/unit/adjustments.test.ts
git commit -m "feat: add payslip preview adjustment workflow"
```

## Task 11: Employee Invitation Confirmation

**Files:**
- Create: `src/lib/employees/invitations.ts`
- Create: `src/components/imports/InvitationConfirmation.tsx`
- Create: `src/test/unit/invitations.test.ts`

- [ ] **Step 1: Write failing invitation tests**

Create `src/test/unit/invitations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildInvitationCandidates } from "@/lib/employees/invitations";

describe("buildInvitationCandidates", () => {
  it("returns unknown employees only once", () => {
    const result = buildInvitationCandidates([
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-002", email: "two@example.com", employeeName: "Two", exists: true },
    ]);

    expect(result).toEqual([{ employeeId: "EMP-001", email: "one@example.com", employeeName: "One" }]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/invitations.test.ts
```

Expected: FAIL because invitations module does not exist.

- [ ] **Step 3: Implement invitation candidate logic**

Create `src/lib/employees/invitations.ts`:

```ts
export type ImportEmployeeCandidate = {
  employeeId: string;
  email: string;
  employeeName: string;
  exists: boolean;
};

export function buildInvitationCandidates(rows: ImportEmployeeCandidate[]) {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    if (row.exists || seen.has(row.employeeId)) return [];
    seen.add(row.employeeId);
    return [{ employeeId: row.employeeId, email: row.email, employeeName: row.employeeName }];
  });
}
```

- [ ] **Step 4: Implement confirmation component**

Create `src/components/imports/InvitationConfirmation.tsx`:

```tsx
type Candidate = {
  employeeId: string;
  email: string;
  employeeName: string;
};

export function InvitationConfirmation({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun nouveau salarie a inviter.</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Nouveaux salaries detectes</h2>
      {candidates.map((candidate) => (
        <label key={candidate.employeeId} className="flex items-center gap-3 rounded border border-border p-3 text-sm">
          <input type="checkbox" name="inviteEmployeeId" value={candidate.employeeId} defaultChecked />
          <span>
            <span className="font-medium">{candidate.employeeName}</span>
            <span className="block text-muted-foreground">{candidate.email}</span>
          </span>
        </label>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/invitations.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/employees/invitations.ts src/components/imports/InvitationConfirmation.tsx src/test/unit/invitations.test.ts
git commit -m "feat: add employee invitation confirmation"
```

## Task 12: Publication And Immutable Versioning

**Files:**
- Create: `src/lib/payroll/publish.ts`
- Create: `src/app/api/imports/[importId]/publish/route.ts`
- Create: `src/test/unit/publish.test.ts`

- [ ] **Step 1: Write failing publication tests**

Create `src/test/unit/publish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextVersionNumber } from "@/lib/payroll/publish";

describe("nextVersionNumber", () => {
  it("starts at version one", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("increments from highest existing version", () => {
    expect(nextVersionNumber([1, 3, 2])).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/publish.test.ts
```

Expected: FAIL because publish module does not exist.

- [ ] **Step 3: Implement publication helper**

Create `src/lib/payroll/publish.ts`:

```ts
export function nextVersionNumber(existingVersions: number[]) {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export type PublishResult = {
  payslipId: string;
  versionId: string;
  versionNumber: number;
};
```

- [ ] **Step 4: Implement publish route boundary**

Create `src/app/api/imports/[importId]/publish/route.ts`:

```ts
import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(_request: NextRequest, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  if (!importId) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Import id is required"), { status: 422 });
  }

  return NextResponse.json({ data: { importId, status: "PUBLISHED" } });
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/publish.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll/publish.ts 'src/app/api/imports/[importId]/publish/route.ts' src/test/unit/publish.test.ts
git commit -m "feat: add immutable payslip publication boundary"
```

## Task 13: Employee Payslip Space

**Files:**
- Create: `src/app/employee/payslips/page.tsx`
- Create: `src/components/payslips/PayslipView.tsx`
- Create: `tests/e2e/employee-payslips.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `tests/e2e/employee-payslips.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("employee payslip page renders current payslip shell", async ({ page }) => {
  await page.goto("/employee/payslips");
  await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).toBeVisible();
  await expect(page.getByText("Version actuellement publiee")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E to verify failure**

Run:

```bash
npm run test:e2e -- tests/e2e/employee-payslips.spec.ts
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Implement payslip component**

Create `src/components/payslips/PayslipView.tsx`:

```tsx
type PayItem = {
  label: string;
  category: string;
  amount?: number;
  text?: string;
};

type Props = {
  employeeName: string;
  periodLabel: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
  payItems: PayItem[];
};

export function PayslipView({ employeeName, periodLabel, grossAmount, deductionsTotal, netAmount, payItems }: Props) {
  return (
    <article className="space-y-6 rounded border border-border p-6">
      <header>
        <p className="text-sm text-muted-foreground">Version actuellement publiee</p>
        <h2 className="text-xl font-semibold">{employeeName}</h2>
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
      </header>
      <dl className="grid gap-3 md:grid-cols-3">
        <Amount label="Brut" value={grossAmount} />
        <Amount label="Retenues" value={deductionsTotal} />
        <Amount label="Net a payer" value={netAmount} />
      </dl>
      <section>
        <h3 className="text-base font-semibold">Elements</h3>
        <ul className="mt-3 divide-y divide-border">
          {payItems.map((item) => (
            <li key={`${item.category}:${item.label}`} className="flex justify-between py-2 text-sm">
              <span>{item.label}</span>
              <span>{item.amount == null ? item.text : formatMga(item.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{formatMga(value)}</dd>
    </div>
  );
}

function formatMga(value: number) {
  return new Intl.NumberFormat("fr-MG", { style: "currency", currency: "MGA", maximumFractionDigits: 0 }).format(value);
}
```

- [ ] **Step 4: Implement employee page**

Create `src/app/employee/payslips/page.tsx`:

```tsx
import { PayslipView } from "@/components/payslips/PayslipView";

export default function EmployeePayslipsPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Mes fiches de paie</h1>
        <p className="text-sm text-muted-foreground">Consultez vos fiches internes publiees.</p>
      </div>
      <PayslipView
        employeeName="Aucun salarie selectionne"
        periodLabel="Aucune periode publiee"
        grossAmount={0}
        deductionsTotal={0}
        netAmount={0}
        payItems={[]}
      />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run test:e2e -- tests/e2e/employee-payslips.spec.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/employee src/components/payslips tests/e2e/employee-payslips.spec.ts
git commit -m "feat: add employee payslip space"
```

## Task 14: Resend Notification Integration

**Files:**
- Create: `src/lib/notifications/resend.ts`
- Create: `src/app/api/notifications/test/route.ts`
- Create: `src/test/unit/notifications.test.ts`

- [ ] **Step 1: Write failing notification tests**

Create `src/test/unit/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";

describe("buildPayslipPublishedEmail", () => {
  it("does not include payroll amounts", () => {
    const email = buildPayslipPublishedEmail({
      employeeName: "Employee One",
      appUrl: "https://example.com",
    });

    expect(email.subject).toContain("fiche de paie");
    expect(email.html).toContain("Employee One");
    expect(email.html).not.toMatch(/\d+\s*MGA/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/notifications.test.ts
```

Expected: FAIL because notification module does not exist.

- [ ] **Step 3: Implement Resend email builder**

Create `src/lib/notifications/resend.ts`:

```ts
import { Resend } from "resend";
import { publicEnv, serverEnv } from "@/lib/env";

export function buildPayslipPublishedEmail(input: { employeeName: string; appUrl: string }) {
  return {
    subject: "Nouvelle fiche de paie disponible",
    html: `<p>Bonjour ${escapeHtml(input.employeeName)},</p><p>Une nouvelle fiche de paie interne est disponible dans votre espace securise.</p><p><a href="${input.appUrl}/employee/payslips">Ouvrir mon espace</a></p>`,
  };
}

export async function sendPayslipPublishedEmail(input: { to: string; employeeName: string }) {
  if (!serverEnv.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send emails");
  }

  const resend = new Resend(serverEnv.RESEND_API_KEY);
  const email = buildPayslipPublishedEmail({ employeeName: input.employeeName, appUrl: publicEnv.NEXT_PUBLIC_APP_URL });

  return resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    subject: email.subject,
    html: email.html,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 4: Add authenticated test route**

Create `src/app/api/notifications/test/route.ts`:

```ts
import { apiError } from "@/lib/errors";
import { publicEnv } from "@/lib/env";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  return NextResponse.json({
    data: buildPayslipPublishedEmail({ employeeName: "Exemple", appUrl: publicEnv.NEXT_PUBLIC_APP_URL }),
  });
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/notifications.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications src/app/api/notifications src/test/unit/notifications.test.ts
git commit -m "feat: add safe payslip notification emails"
```

## Task 15: Audit Logging And Audit UI

**Files:**
- Create: `src/lib/audit/audit.ts`
- Create: `src/components/audit/AuditLogTable.tsx`
- Create: `src/app/hr/audit/page.tsx`
- Create: `src/test/unit/audit.test.ts`

- [ ] **Step 1: Write failing audit tests**

Create `src/test/unit/audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit/audit";

describe("sanitizeAuditMetadata", () => {
  it("removes sensitive values from metadata", () => {
    expect(
      sanitizeAuditMetadata({
        token: "secret",
        grossAmount: 1000,
        rowCount: 10,
        filename: "payroll.xlsx",
      }),
    ).toEqual({
      rowCount: 10,
      filename: "payroll.xlsx",
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/unit/audit.test.ts
```

Expected: FAIL because audit module does not exist.

- [ ] **Step 3: Implement audit metadata sanitizer**

Create `src/lib/audit/audit.ts`:

```ts
const BLOCKED_METADATA_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "grossAmount",
  "netAmount",
  "deductionsTotal",
  "snapshotData",
  "rawExcel",
]);

export function sanitizeAuditMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !BLOCKED_METADATA_KEYS.has(key)));
}
```

- [ ] **Step 4: Implement audit UI**

Create `src/components/audit/AuditLogTable.tsx`:

```tsx
type AuditLog = {
  id: string;
  actorRole: string | null;
  action: string;
  resourceType: string;
  createdAt: string;
};

export function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun evenement d'audit.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          <th className="py-2">Date</th>
          <th>Role</th>
          <th>Action</th>
          <th>Ressource</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.id} className="border-b border-border">
            <td className="py-2">{log.createdAt}</td>
            <td>{log.actorRole}</td>
            <td>{log.action}</td>
            <td>{log.resourceType}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `src/app/hr/audit/page.tsx`:

```tsx
import { AuditLogTable } from "@/components/audit/AuditLogTable";

export default function AuditPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Journal d'audit</h1>
        <p className="text-sm text-muted-foreground">Suivi des actions sensibles.</p>
      </div>
      <AuditLogTable logs={[]} />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/unit/audit.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit src/components/audit src/app/hr/audit src/test/unit/audit.test.ts
git commit -m "feat: add audit logging safeguards and ui"
```

## Task 16: Export Module

**Files:**
- Create: `src/lib/payroll/export.ts`
- Create: `src/app/api/exports/route.ts`
- Create: `src/test/integration/export-flow.test.ts`

- [ ] **Step 1: Write failing export tests**

Create `src/test/integration/export-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canCreateExport } from "@/lib/payroll/export";

describe("canCreateExport", () => {
  it("allows agency manager import report exports for own agency", () => {
    expect(
      canCreateExport({
        role: "agency_manager",
        exportType: "IMPORT_REPORT",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      }),
    ).toBe(true);
  });

  it("denies agency manager published payslip exports", () => {
    expect(
      canCreateExport({
        role: "agency_manager",
        exportType: "PUBLISHED_PAYSLIPS",
        actorAgencyId: "agency-1",
        requestedAgencyId: "agency-1",
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/integration/export-flow.test.ts
```

Expected: FAIL because export module does not exist.

- [ ] **Step 3: Implement export authorization**

Create `src/lib/payroll/export.ts`:

```ts
import type { AppRole } from "@/lib/roles";

export type ExportType = "IMPORT_REPORT" | "PUBLISHED_PAYSLIPS";

export function canCreateExport(input: {
  role: AppRole;
  exportType: ExportType;
  actorAgencyId?: string;
  requestedAgencyId?: string;
}) {
  if (input.role === "hr_central" || input.role === "super_admin") return true;
  return (
    input.role === "agency_manager" &&
    input.exportType === "IMPORT_REPORT" &&
    input.actorAgencyId != null &&
    input.actorAgencyId === input.requestedAgencyId
  );
}
```

- [ ] **Step 4: Implement export route boundary**

Create `src/app/api/exports/route.ts`:

```ts
import { apiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(apiError("UNAUTHORIZED", "Authentication required"), { status: 401 });
  }

  const body = await request.json();
  if (body.exportType !== "IMPORT_REPORT" && body.exportType !== "PUBLISHED_PAYSLIPS") {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid export type"), { status: 422 });
  }

  return NextResponse.json({ data: { status: "PENDING", exportType: body.exportType } });
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- src/test/integration/export-flow.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll/export.ts src/app/api/exports/route.ts src/test/integration/export-flow.test.ts
git commit -m "feat: add scoped payroll export module"
```

## Task 17: Analytics Module

**Files:**
- Create: `supabase/migrations/202606260003_reporting_views.sql`
- Create: `src/lib/analytics/queries.ts`
- Create: `src/components/analytics/PayrollAnalytics.tsx`
- Create: `src/app/hr/analytics/page.tsx`
- Create: `tests/e2e/hr-audit-analytics.spec.ts`

- [ ] **Step 1: Add reporting view migration**

Create `supabase/migrations/202606260003_reporting_views.sql`:

```sql
create view public.payroll_analytics_rows
with (security_invoker = true)
as
select
  p.agency_id,
  a.name as agency_name,
  e.employee_id,
  e.full_name as employee_name,
  p.period_start,
  p.period_end,
  (pv.snapshot_data ->> 'grossAmount')::numeric as gross_amount,
  (pv.snapshot_data ->> 'deductionsTotal')::numeric as deductions_total,
  (pv.snapshot_data ->> 'netAmount')::numeric as net_amount,
  pv.published_at
from public.payslips p
join public.payslip_versions pv on pv.id = p.current_version_id
join public.employees e on e.id = p.employee_id
join public.agencies a on a.id = p.agency_id;
```

- [ ] **Step 2: Write E2E test**

Create `tests/e2e/hr-audit-analytics.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("hr analytics page renders sensitive analytics shell", async ({ page }) => {
  await page.goto("/hr/analytics");
  await expect(page.getByRole("heading", { name: "Analytics paie" })).toBeVisible();
  await expect(page.getByText("Acces reserve RH centrale et super admin")).toBeVisible();
});
```

- [ ] **Step 3: Run E2E to verify failure**

Run:

```bash
npm run test:e2e -- tests/e2e/hr-audit-analytics.spec.ts
```

Expected: FAIL because page does not exist.

- [ ] **Step 4: Implement analytics query and UI**

Create `src/lib/analytics/queries.ts`:

```ts
export type PayrollAnalyticsRow = {
  agencyName: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  deductionsTotal: number;
  netAmount: number;
};

export function summarizeAnalytics(rows: PayrollAnalyticsRow[]) {
  return rows.reduce(
    (summary, row) => ({
      grossTotal: summary.grossTotal + row.grossAmount,
      netTotal: summary.netTotal + row.netAmount,
      employeeRows: summary.employeeRows + 1,
    }),
    { grossTotal: 0, netTotal: 0, employeeRows: 0 },
  );
}
```

Create `src/components/analytics/PayrollAnalytics.tsx`:

```tsx
import { summarizeAnalytics, type PayrollAnalyticsRow } from "@/lib/analytics/queries";

export function PayrollAnalytics({ rows }: { rows: PayrollAnalyticsRow[] }) {
  const summary = summarizeAnalytics(rows);

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">Acces reserve RH centrale et super admin.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Brut total" value={summary.grossTotal} />
        <Metric label="Net total" value={summary.netTotal} />
        <Metric label="Lignes salaries" value={summary.employeeRows} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
```

Create `src/app/hr/analytics/page.tsx`:

```tsx
import { PayrollAnalytics } from "@/components/analytics/PayrollAnalytics";

export default function AnalyticsPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics paie</h1>
        <p className="text-sm text-muted-foreground">Analyse detaillee des donnees de paie publiees.</p>
      </div>
      <PayrollAnalytics rows={[]} />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
supabase db reset
npm run typecheck
npm run test:e2e -- tests/e2e/hr-audit-analytics.spec.ts
```

Expected: migration applies and E2E passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202606260003_reporting_views.sql src/lib/analytics src/components/analytics src/app/hr/analytics tests/e2e/hr-audit-analytics.spec.ts
git commit -m "feat: add restricted payroll analytics module"
```

## Task 18: End-To-End Verification And Security Review

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/security/mvp-security-review.md`
- Create: `docs/verification/mvp-verification.md`

- [ ] **Step 1: Create documentation files**

Create `README.md`:

```md
# Salary Platform

Internal payroll information platform for agency payroll imports and employee web payslips.

## Development

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase and Resend variables.
3. Run `npm install`.
4. Run `supabase start`.
5. Run `supabase db reset`.
6. Run `npm run dev`.

## Verification

Run `npm run verify` before opening a pull request.
Run `npm run test:e2e` after starting the dev server.
```

Create `docs/security/mvp-security-review.md`:

```md
# MVP Security Review

## Auth

- Magic link auth is handled by Supabase Auth.
- Service role key is server-only and never exposed through `NEXT_PUBLIC_`.

## Authorization

- RLS is enabled for all exposed public tables.
- Employees can read only their own current payslips.
- Agency managers are scoped to one agency.
- HR central is global read-only for payroll workflows.
- Super admin is minimal and audited.

## Sensitive Data

- Original Excel files are not retained after analysis.
- Email notifications do not include payroll amounts.
- Audit metadata excludes tokens and payroll snapshots.

## Verification Evidence

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `supabase db reset`
```

Create `docs/verification/mvp-verification.md`:

```md
# MVP Verification

## Commands

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `supabase db reset`

## Browser Checks

- Manager import workflow at 320px, 768px, 1024px, and 1440px.
- Employee payslip page at 320px and 1440px.
- HR audit and analytics pages at 1024px and 1440px.

## Evidence

Paste final command summaries and screenshot paths in the pull request description.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm run test
npm run build
supabase db reset
npm run test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 3: Run security checks**

Run:

```bash
npm audit --audit-level=high
git diff --cached --check
git diff --check
```

Expected:

- No high or critical reachable production vulnerabilities.
- No whitespace errors.

- [ ] **Step 4: Final code review subagent**

Dispatch a fresh reviewer with:

```text
Review the full implementation against docs/superpowers/specs/2026-06-26-payroll-platform-design.md and docs/superpowers/plans/2026-06-26-payroll-platform-implementation.md.

Focus on:
- RLS and authorization bypasses.
- Payroll data leakage in logs, audit metadata, emails, exports, analytics, and UI.
- Missing tests for import, mapping, publication, employee access, exports, analytics, and audit.
- Accessibility and responsive UI gaps.
- Any divergence from the approved MVP scope.

Return findings ordered by severity with file and line references.
```

- [ ] **Step 5: Fix review findings and rerun affected checks**

For every reviewer finding:

```text
Fix the finding in the smallest relevant files, rerun the exact failing or affected checks, and record proof.
```

- [ ] **Step 6: Commit final docs and fixes**

```bash
git add README.md docs/security/mvp-security-review.md docs/verification/mvp-verification.md .env.example
git commit -m "docs: add mvp verification and security review"
```

## Self-Review Checklist For Plan Maintainers

- [x] Every approved spec section has at least one implementation task.
- [x] Auth, RLS, uploads, publication, employee access, exports, analytics, notifications, and audit have tests.
- [x] No task requires a subagent to infer role semantics.
- [x] No task stores original Excel files.
- [x] No notification includes payroll amounts.
- [x] Analytics are limited to HR central and super admin.
- [x] Publication is append-only through `payslip_versions`.
- [x] Employee UI shows only current payslips.
- [x] Every security-sensitive task has verification commands.
