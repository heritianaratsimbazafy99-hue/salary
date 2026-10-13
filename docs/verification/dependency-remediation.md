# Dependency remediation — 2026-10-13

The npm audit decreased from **21 affected packages** (6 moderate, 14 high,
1 critical) to **0 vulnerabilities at every severity**, including development
dependencies. No advisory was allowlisted or suppressed. No production deployment
was performed.

## Changes

| Dependency | Before | After |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.2.9 | 16.3.8 |
| Tailwind / @tailwindcss/postcss | 4.3.1 | 4.3.3 |
| Vitest | 4.1.9 | 4.1.11 |
| sharp | 0.34.5 | 0.35.5 |
| PostCSS | 8.4.31 / 8.5.15 | 8.5.23 inside Next / 8.5.30 elsewhere |
| UUID consumed by ExcelJS | 8.3.2 | 11.1.1 |
| undici | 7.28.0 | 7.30.0 |

Compatible lockfile updates also remediate baseline-browser-mapping,
brace-expansion, browserslist, fast-uri, js-yaml, nanoid and source-map-js.
React, Supabase, Sentry and ExcelJS direct versions remain unchanged.

Two narrowly scoped overrides need maintenance:

- ExcelJS 4.4.0 uses UUID's CommonJS `v4()` API. UUID 11.1.1 retains that API
  and contains the [official security backport](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).
  A real formatted XLSX round trip and payroll import test exercises this path.
- The Next ESLint plugin's fast-glob dependency brought in micromatch and braces.
  There is [no published braces fix](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  for the reported stack-exhaustion issue. A private adapter uses tinyglobby for
  the plugin's single consumed API, preserving its ESLint rules. The vulnerable
  dependency chain is removed. See [adapter contract and maintenance](../../vendor/next-eslint-glob/README.md).
  Fifteen tests verify root discovery, installed-module resolution and actual
  `no-html-link-for-pages` diagnostics. The local root dependency and `$fast-glob`
  reference are required for reproducible npm resolution.

Next 16.3.8 is the minimal patched 16.x version for the reported Next advisories;
see the [upstream release](https://github.com/vercel/next.js/releases/tag/v16.3.8).
No `npm audit fix --force` downgrade was applied.

## Verification

The final full gate used Node **22.23.3**, npm **10**, local Supabase and local
email capture. `PLAYWRIGHT_USE_PRODUCTION_BUILD=1` made Playwright start the actual
production build with `next start`; it refused to reuse a development server.
The same loopback configuration was supplied during build and execution.
Sentry upload and telemetry delivery were disabled for this local run.

| Check | Result |
| --- | --- |
| Clean `npm ci` under Node 22/npm 10 | Passed; 0 vulnerabilities |
| `npm ls --all` | Passed; no invalid dependency edges |
| `npm run verify:full` | Passed, exit 0 |
| ESLint | 0 errors; two navigation warnings on existing `window.location.assign` calls |
| TypeScript | Passed |
| Vitest | 312 tests passed across 33 files |
| Production build | Passed |
| Playwright on production build | 40 tests passed in 56.4 seconds, desktop and mobile |
| Supabase advisors | No issues found |
| Final `npm audit --json` | 0 low, moderate, high or critical findings |
| Secret scan including new files | Passed |

The browser suite covers payroll import/mapping/publication, employee activation
from actual locally captured email, manager resend, subsequent login, payslip
and CSV access, role restrictions, and rejected invitation states. No browser
console or uncaught page errors were found by the activation scenario.

Non-blocking tooling notices remain: a Vite warning about a future configuration
loader default and deprecation notices for some transitive packages. These are
not npm audit findings; no tests or safety checks were disabled to obtain this result.

## Release boundary

Dependency remediation and the local release gate are complete. Applying the
employee-activation migration to the intended production database, deploying the
changes, and verifying delivery to a real mailbox remain release actions. Local
email capture does not establish external provider delivery.
