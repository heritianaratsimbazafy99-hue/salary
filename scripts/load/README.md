# Capacity: Airtel 300 + Huawei 40

`capacity-local.mjs` runs only against **127.0.0.1:3000**, **Supabase 127.0.0.1:55421**, and the captured email transport **127.0.0.1:55428**. It obtains keys directly from `supabase status`, never from `.env.local`. Compile/start the app with these same local endpoints and local Supabase keys; no production credential is appropriate.

Use Node 24. Start the existing mail mock (`node tests/e2e/helpers/mail-server.mjs`) and a production build (`npm run build`, then `npm run start`) with `RESEND_BASE_URL=http://127.0.0.1:55428`, local placeholder Resend credentials and empty Sentry DSNs. Coordinate ownership of shared services before running. No database reset is needed.

```sh
node scripts/load/capacity-local.mjs --local-only --output=test-results/capacity-final
```

The run creates two uniquely named agencies, 300 + 40 generated payroll rows, publishes both imports through real application endpoints, counts individually captured invitations, and activates 340 fixture employees via the real invitation RPC. Real local Auth OTP verification, authenticated CSV/page/PDF reads and forbidden cross-agency PDF requests are measured at concurrency 10, 40, 100 and 340. Each stage processes all 340 distinct employees. Percentiles, throughput, errors, fixture identifiers and machine specifications are saved in `manifest.json`. Session tokens and private OTP hashes are never persisted. A nonzero exit code means a failed request, missing/duplicate invitation, failed assertion or incomplete cleanup.

The harness cleans only its exact fixture identities by default, verifies deletion, and deletes Auth users (revoking refresh sessions). `--publication-only` permits a quick baseline before mail transport fixes. `--keep-fixtures` is for diagnosis; later cleanup requires the saved manifest:

```sh
node scripts/load/capacity-local.mjs --local-only --cleanup=test-results/capacity-final/manifest.json
```

These measurements describe local compiled Next.js, local Postgres/Auth, and the configured mail mock. They do **not** establish Vercel/Supabase production throughput, actual email delivery, or the provider's available daily/monthly quota. The local Auth verification/IP quota is intentionally left active and may cause HTTP 429 during repeated waves; record it separately from authenticated-session capacity.

## Independent Auth quota/pool probe

```sh
node scripts/load/auth-quota-local.mjs --local-only --output=test-results/auth-quota-probe
```

This creates and removes 340 local Auth identities, verifies 340 private OTP hashes at once and records HTTP statuses. It does not send OTP emails. Rate-limit configuration values are recorded, but they do not establish identical enforcement through the managed production proxy. Local `token_hash` verification can succeed even when `GOTRUE_RATE_LIMIT_VERIFY=30`; never infer the production quota from that result.

The standard local Auth container has an unbounded database pool by default. With Postgres `max_connections=100`, a 340-request authentication burst can exhaust connections (SQLSTATE 53300). For a separate comparison, the release run temporarily set the local Auth pool maximum and idle size to 10, matching the managed project's observed pool maximum. This is an infrastructure profile for the local experiment, not an application change or a production change. The initial local `/.env` was absent; two non-secret parameters were placed there, only Auth was restarted, and the file must be removed and Auth restarted after measurements. Do not overwrite an existing file or modify credentials.

Primary references: [GoTrue pool configuration](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go), [local Auth pooling issue](https://github.com/supabase/auth/issues/2831).

After a failed login burst, the full capacity harness establishes the missing sessions at concurrency 2 outside the latency measurements. This allows every subsequent read stage to exercise all 340 users while retaining the burst failures in its report. It also measures real refresh requests separately. These HTTP load measurements are not a test of 340 concurrently rendered browser windows.

For read-only SQL profiling, `--prepare-only --keep-fixtures` creates/publishes/activates the full dataset without starting load measurements. It leaves the same exact-ID cleanup manifest. Coordinate SQL probes and migrations with the owner of the shared database; concurrent profiler queries distort latency measurements.

Kong's local Nginx worker defaults to 512 sockets, counting incoming and upstream connections. A full 340-session workload can hit that development-only ceiling and cause `UND_ERR_SOCKET` before Auth sees a request. The comparison run therefore temporarily used `worker_connections 2048` in the local Kong config (original file preserved, syntax checked, Nginx reloaded). It retained the PostgREST pool at 10 and its 10-second acquisition timeout. Restore the exact original Kong config and reload it after testing. This removes a local proxy artifact; it does not increase a production quota or establish the managed proxy's capacity.

Activation is fixture preparation through `accept_employee_invitation`, followed by private direct Auth OTP verification. It is **not** 340 calls to the UI `requestEmployeeActivation` flow: that flow sends individual confirmation emails, subject to the real provider's request rate, retries and daily/monthly limits. Session-read capacity and a burst of first-time activation emails are distinct claims. Neither real SMTP quotas nor managed source-IP limits are validated by this local harness.

Add `--resend-invitations` to separately measure the full 300 + 40 invitation resend after the real 60-second cooldown, before activating fixture accounts. Each employee must then have exactly two captured mock emails: the original publication invitation and the explicitly requested resend. Publication and resend timings remain separate in the report; this option adds 340 simulated emails, never real delivery.
