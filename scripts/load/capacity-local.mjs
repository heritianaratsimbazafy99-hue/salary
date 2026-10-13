#!/usr/bin/env node
// Local-only capacity evidence. Never loads .env.local or accepts production keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import ExcelJS from 'exceljs';
const APP = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:55421';
const MAIL = 'http://127.0.0.1:55428';
const args = process.argv.slice(2);
if (!args.includes('--local-only')) throw new Error('Explicit --local-only required. See scripts/load/README.md.');
for (const [key, expected] of [['NEXT_PUBLIC_APP_URL', APP], ['NEXT_PUBLIC_SUPABASE_URL', API], ['RESEND_BASE_URL', MAIL]]) {
  if (process.env[key] && new URL(process.env[key]).origin !== expected) throw new Error(`${key} must match the fixed local target.`);
}
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
if (new URL(status.API_URL).origin !== API) throw new Error('Supabase status target mismatch.');
const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(API, status.SERVICE_ROLE_KEY, options);
const fresh = () => createClient(API, publicKey, options);
const ensure = (value, label) => { if (!value) throw new Error(label); };
const ok = (result, label) => { ensure(!result.error, `${label}: ${result.error?.message || ''}`); return result.data; };
const cleanupArg = args.find((x) => x.startsWith('--cleanup='))?.slice(10);
const runId = randomUUID();
const output = path.resolve(args.find((x) => x.startsWith('--output='))?.slice(9) || `test-results/capacity-${runId}`);
await fs.mkdir(output, { recursive: true, mode: 0o700 });
let manifest = { runId, api: API, app: APP, startedAt: new Date().toISOString(), agencies: [], users: [], imports: [], checks: [], metrics: [], environment: { platform: os.platform(), arch: os.arch(), logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 1024 ** 3), node: process.version }, limitations: ['Local compiled app and local Supabase; not a production capacity guarantee.', 'Mail transport is a local fake; this does not measure provider quotas or deliverability.', 'Fixture activation uses accept_employee_invitation RPC, then direct local Auth OTP verification; this is not 340 simultaneous UI activation requests or 340 confirmation emails.', 'Real SMTP/provider quotas, managed source-IP limits, and simultaneous first-use delivery remain outside this local test.'] };
try { const authEnv = JSON.parse(execFileSync('docker', ['inspect', 'supabase_auth_salary-platform', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' })); manifest.environment.authQuotas = authEnv.filter((v) => /^GOTRUE_RATE_LIMIT_(VERIFY|OTP|TOKEN_REFRESH|EMAIL_SENT)=/.test(v)); manifest.environment.localAuthPoolOverride = execFileSync('docker', ['exec', 'supabase_auth_salary-platform', 'sh', '-c', 'if test -f /.env; then cat /.env; fi'], { encoding: 'utf8' }).split('\n').filter((v) => /^GOTRUE_DB_MAX_(IDLE_)?POOL_SIZE=/.test(v)); manifest.environment.localKongWorkerOverride = execFileSync('docker', ['exec', 'supabase_kong_salary-platform', 'sh', '-c', 'grep worker_connections /usr/local/kong/nginx.conf || true'], { encoding: 'utf8' }).trim() || 'Nginx default (512)'; manifest.environment.postgresMaxConnections = execFileSync('docker', ['exec', 'supabase_db_salary-platform', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', 'show max_connections;'], { encoding: 'utf8' }).trim(); } catch { manifest.environment.authQuotas = ['unavailable']; }
try { manifest.environment.nextBuildId = (await fs.readFile('.next/BUILD_ID', 'utf8')).trim(); } catch { manifest.environment.nextBuildId = 'unavailable'; }
let manifestPath = path.join(output, 'manifest.json');
if (cleanupArg) { manifestPath = path.resolve(cleanupArg); manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); ensure(manifest.api === API && manifest.app === APP, 'Cleanup target mismatch.'); }
let saveQueue = Promise.resolve();
async function save() { const body = `${JSON.stringify(manifest, null, 2)}\n`; saveQueue = saveQueue.then(() => fs.writeFile(manifestPath, body, { mode: 0o600 })); await saveQueue; }
async function check(label, details = {}) { manifest.checks.push({ label, ...details }); await save(); console.log(`PASS ${label}`); }
async function pool(items, concurrency, fn) {
  let next = 0; const values = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (next < items.length) { const index = next++; values[index] = await fn(items[index], index); } }));
  return values;
}
async function measured(label, items, concurrency, fn) {
  const begin = performance.now();
  const samples = await pool(items, concurrency, async (item, i) => { const start = performance.now(); try { await fn(item, i); return { ms: performance.now() - start, ok: true }; } catch (e) { return { ms: performance.now() - start, ok: false, error: e.message }; } });
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const elapsedMs = Math.round(performance.now() - begin);
  const metric = { label, requests: items.length, concurrency, elapsedMs, requestsPerSecond: +(items.length / elapsedMs * 1000).toFixed(2), p50Ms: Math.round(sorted[Math.ceil(sorted.length * .5) - 1]), p95Ms: Math.round(sorted[Math.ceil(sorted.length * .95) - 1]), maxMs: Math.round(sorted.at(-1)), errors: samples.filter((s) => !s.ok).length, errorExamples: [...new Set(samples.filter((s) => !s.ok).map((s) => s.error))].slice(0, 5) };
  manifest.metrics.push(metric); await save(); console.log(JSON.stringify(metric)); return metric;
}
async function http(route, cookie, init = {}) {
  const response = await fetch(`${APP}${route}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(120000), headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
  return response;
}
async function cookieFor(session) {
  const jar = [];
  const ssr = createBrowserClient(API, publicKey, { isSingleton: false, auth: { autoRefreshToken: false, detectSessionInUrl: false }, cookies: { getAll: () => jar, setAll: (cookies) => { for (const c of cookies) { const i = jar.findIndex((v) => v.name === c.name); if (i >= 0) jar.splice(i, 1); if (c.value) jar.push(c); } } } });
  ok(await ssr.auth.setSession(session), 'Build SSR cookie');
  return jar.map((c) => `${c.name}=${c.value}`).join('; ');
}
async function createUser(role, email, name) {
  const auth = ok(await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { capacity_run_id: manifest.runId } }), 'Create fixture Auth').user;
  const user = { authId: auth.id, profileId: randomUUID(), email, name, role }; manifest.users.push(user); await save();
  ok(await admin.from('profiles').insert({ id: user.profileId, auth_user_id: user.authId, email, full_name: name, role }), 'Create fixture profile'); return user;
}
async function generate(user) { const data = ok(await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email }), 'Generate local private OTP'); return data.properties.hashed_token; }
async function signIn(user, hash) { const c = fresh(); const data = ok(await c.auth.verifyOtp({ token_hash: hash, type: 'email' }), 'Verify local OTP'); ensure(data.session && data.user.id === user.authId, 'Authenticated identity mismatch'); return { user, session: data.session }; }
async function publishAgency(agency, manager) {
  const signed = await signIn(manager, await generate(manager)); const cookie = await cookieFor(signed.session);
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('payroll');
  sheet.addRow(['employee_id', 'email', 'period_start', 'period_end', 'employee_name', 'gross_amount', 'deductions_total', 'net_amount']);
  agency.employees = Array.from({ length: agency.count }, (_, i) => ({ code: `${agency.label}-${String(i + 1).padStart(4, '0')}`, email: `capacity-${manifest.runId}-${agency.label.toLowerCase()}-${i}@example.com`, name: `Capacité ${agency.label} ${String(i + 1).padStart(4, '0')}` })); await save();
  const today = new Date(); const start = `${today.toISOString().slice(0, 7)}-01`; const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  for (const e of agency.employees) sheet.addRow([e.code, e.email, start, end, e.name, 1500000, 250000, 1250000]);
  const bytes = await book.xlsx.writeBuffer(); const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${agency.label}.xlsx`); form.append('agencyId', agency.id); form.append('periodStart', start); form.append('periodEnd', end);
  await measured(`import_${agency.label}`, [agency], 1, async () => {
    const response = await http('/api/imports', cookie, { method: 'POST', body: form }); const body = await response.json(); ensure(response.ok, `Import HTTP ${response.status}: ${JSON.stringify(body)}`); ensure(body.data.validRowCount === agency.count && body.data.status === 'READY_FOR_PREVIEW', 'Import missing rows'); agency.importId = body.data.importId; manifest.imports.push(agency.importId); await save();
  });
  ensure(agency.importId, 'Import not created');
  const reviewed = await http(`/api/imports/${agency.importId}/review`, cookie); const review = await reviewed.json(); ensure(reviewed.ok && review.data.recipients.length === agency.count, 'Review recipient count mismatch');
  await measured(`publication_${agency.label}`, [agency], 1, async () => {
    const response = await http(`/api/imports/${agency.importId}/publish`, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true, fingerprint: review.data.fingerprint }) }); const body = await response.json(); ensure(response.ok && body.data.publishedCount === agency.count, `Publication HTTP ${response.status}: ${JSON.stringify(body)}`);
  });
  const slips = ok(await admin.from('payslips').select('id,employee_id').eq('agency_id', agency.id), 'Read published payslips'); ensure(slips.length === agency.count, 'Published count mismatch');
  const employees = ok(await admin.from('employees').select('id,employee_id').eq('agency_id', agency.id), 'Read employees');
  for (const e of agency.employees) { e.employeeUuid = employees.find((v) => v.employee_id === e.code)?.id; e.payslipId = slips.find((v) => v.employee_id === e.employeeUuid)?.id; ensure(e.payslipId, 'Missing employee payslip'); }
  let received = 0; let duplicates = 0;
  await pool(agency.employees, 10, async (e) => { const response = await fetch(`${MAIL}/messages?to=${encodeURIComponent(e.email)}`); const notices = await response.json(); if (notices.length === 1) received++; if (notices.length > 1) duplicates++; });
  await check(`publication_mock_emails_${agency.label}`, { expected: agency.count, received, duplicates, workbookBytes: bytes.byteLength });
  if (received !== agency.count || duplicates) manifest.emailDeliveryFailure = true;
}
async function cleanup() {
  for (const a of manifest.agencies) {
    const existing = ok(await admin.from('agencies').select('name,code').eq('id', a.id).maybeSingle(), 'Cleanup ownership'); if (!existing) continue;
    ensure(existing.name === a.name && existing.code === a.code, 'Agency ownership mismatch');
    ok(await admin.from('payslips').update({ current_version_id: null }).eq('agency_id', a.id), 'Clear version pointers');
    for (const table of ['payslip_versions', 'payslips', 'payroll_imports', 'employee_invitations', 'employees', 'column_mappings', 'audit_logs']) ok(await admin.from(table).delete().eq('agency_id', a.id), `Clean ${table}`);
    for (const e of a.employees || []) ok(await admin.from('notifications').delete().eq('recipient_email', e.email), 'Clean notifications');
  }
  for (const user of manifest.users) {
    const auth = await admin.auth.admin.getUserById(user.authId); if (auth.error?.status !== 404) { ensure(!auth.error && auth.data.user.user_metadata.capacity_run_id === manifest.runId, 'Auth ownership mismatch'); }
    ok(await admin.from('export_jobs').delete().eq('requested_by', user.profileId), 'Clean export jobs'); ok(await admin.from('audit_logs').delete().eq('actor_profile_id', user.profileId), 'Clean actor audit'); ok(await admin.from('agency_memberships').delete().eq('profile_id', user.profileId), 'Clean membership'); ok(await admin.from('profiles').delete().eq('id', user.profileId), 'Clean profile');
    const deleted = await admin.auth.admin.deleteUser(user.authId); ensure(!deleted.error || deleted.error.status === 404, 'Auth cleanup failed');
  }
  for (const a of manifest.agencies) { ok(await admin.from('agencies').delete().eq('id', a.id), 'Clean agency'); for (const table of ['employees', 'payslips', 'payslip_versions', 'payroll_imports', 'employee_invitations', 'column_mappings', 'audit_logs']) { const rows = ok(await admin.from(table).select('id').eq('agency_id', a.id), 'Cleanup verification'); ensure(rows.length === 0, `Residue ${table}`); } }
  await pool(manifest.users, 10, async (user) => { const auth = await admin.auth.admin.getUserById(user.authId); ensure(auth.error?.status === 404, 'Auth residue'); const p = ok(await admin.from('profiles').select('id').eq('id', user.profileId), 'Verify profile cleanup'); ensure(p.length === 0, 'Profile residue'); });
  manifest.cleanedAt = new Date().toISOString(); await check('fixture_cleanup_verified');
}
try {
  await save(); console.log(`MANIFEST ${manifestPath}`);
  if (cleanupArg) { await cleanup(); process.exit(0); }
  ensure((await fetch(`${MAIL}/health`)).ok, 'Local mail mock unavailable'); const health = await fetch(`${APP}/api/health`); ensure(health.ok && (await health.json()).checks.supabase === 'ok', 'Local compiled app unavailable');
  for (const [label, count] of [['AIRTEL', 300], ['HUAWEI', 40]]) {
    const a = { id: randomUUID(), label, count, name: `Capacity ${manifest.runId} ${label}`, code: `CAP-${manifest.runId.slice(0, 8)}-${label}` }; manifest.agencies.push(a); await save(); ok(await admin.from('agencies').insert({ id: a.id, name: a.name, code: a.code }), 'Create agency');
    const manager = await createUser('agency_manager', `capacity-${manifest.runId}-manager-${label.toLowerCase()}@example.com`, `Capacity Manager ${label}`); a.managerAuthId = manager.authId; ok(await admin.from('agency_memberships').insert({ agency_id: a.id, profile_id: manager.profileId }), 'Assign manager'); await publishAgency(a, manager);
  }
  if (args.includes('--publication-only')) { await cleanup(); process.exit(manifest.emailDeliveryFailure ? 1 : 0); }
  if (args.includes('--resend-invitations')) {
    console.log('Waiting for the real 60-second invitation cooldown before the bulk resend check.');
    await new Promise((resolve) => setTimeout(resolve, 61000));
    for (const agency of manifest.agencies) {
      const manager = manifest.users.find((u) => u.authId === agency.managerAuthId);
      const signed = await signIn(manager, await generate(manager)); const cookie = await cookieFor(signed.session);
      await measured(`invitation_resend_${agency.label}`, [agency], 1, async () => {
        const response = await http(`/api/imports/${agency.importId}/invitations`, cookie, { method: 'POST', headers: { origin: APP } });
        const body = await response.json(); ensure(response.ok && body.data?.sent === agency.count && body.data.failed === 0 && body.data.skipped === 0 && body.data.unconfirmed === 0, `Invitation resend HTTP ${response.status}: ${JSON.stringify(body)}`);
        await pool(agency.employees, 10, async (e) => { const notices = await (await fetch(`${MAIL}/messages?to=${encodeURIComponent(e.email)}`)).json(); ensure(notices.length === 2, 'Expected publication invitation plus one explicit resend per employee'); });
      });
    }
  }
  const employees = manifest.agencies.flatMap((agency) => agency.employees.map((e) => ({ ...e, agencyId: agency.id })));
  await pool(employees, 5, async (e) => {
    const user = await createUser('employee', e.email, e.name); Object.assign(e, user);
    const invite = ok(await admin.from('employee_invitations').select('token_hash').eq('agency_id', e.agencyId).eq('email', e.email).eq('status', 'PENDING').single(), 'Find invitation'); ok(await admin.rpc('accept_employee_invitation', { p_auth_user_id: e.authId, p_token_hash: invite.token_hash }), 'Accept invitation');
  }); await check('340_local_activated_employee_accounts');
  for (const concurrency of (args.includes('--prepare-only') ? [] : [10, 40, 100, 340])) {
    // Alternate agencies so small stages exercise both populations. 340 distinct identities at every stage.
    const ordered = []; for (let i = 0; i < 300; i++) { ordered.push(employees[i]); if (i < 40) ordered.push(employees[300 + i]); }
    const hashes = await pool(ordered, 5, (e) => generate(e));
    const signed = new Map();
    await measured('auth_otp_verification', ordered, concurrency, async (e, i) => { const result = await signIn(e, hashes[i]); signed.set(e.authId, result); });
    // Failed burst authentication remains a reported error; recover sequentially only to
    // measure all 340 already-established sessions independently of the login peak.
    const recovery = ordered.filter((e) => !signed.has(e.authId));
    if (recovery.length) { await pool(recovery, 2, async (e) => { const index = ordered.indexOf(e); const result = await signIn(e, hashes[index]); signed.set(e.authId, result); }); await check('auth_burst_recovery_for_read_measurements', { concurrency, recovered: recovery.length }); }
    await measured('auth_token_refresh', ordered, concurrency, async (e) => { const result = ok(await fresh().auth.refreshSession({ refresh_token: signed.get(e.authId).session.refresh_token }), 'Refresh local session'); ensure(result.session, 'Refresh returned no session'); signed.get(e.authId).session = result.session; });
    const cookies = new Map(); await pool(ordered.filter((e) => signed.has(e.authId)), 10, async (e) => cookies.set(e.authId, await cookieFor(signed.get(e.authId).session)));
    const ready = ordered.filter((e) => cookies.has(e.authId));
    if (!ready.length) continue;
    await measured('employee_csv_read', ready, concurrency, async (e) => { const r = await http('/api/employee/payslips/export', cookies.get(e.authId)); const text = await r.text(); ensure(r.status === 200 && text.includes(e.name) && text.includes(e.payslipId), `Employee CSV ${r.status} or identity mismatch`); ensure(text.trim().split('\n').length === 2, 'CSV leaked another employee'); ensure(r.headers.get('cache-control')?.includes('no-store'), 'CSV shared cache'); });
    await measured('employee_page', ready, concurrency, async (e) => { const r = await http('/employee/payslips', cookies.get(e.authId)); const text = await r.text(); ensure(r.status === 200 && text.includes(e.name), `Employee page ${r.status} or identity mismatch`); });
    await measured('employee_pdf', ready, concurrency, async (e) => { const r = await http(`/api/employee/payslips/${e.payslipId}/pdf`, cookies.get(e.authId)); const bytes = Buffer.from(await r.arrayBuffer()); ensure(r.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-', `Employee PDF ${r.status}`); ensure(r.headers.get('cache-control')?.includes('no-store'), 'PDF shared cache'); });
    await measured('cross_agency_pdf_denied', ready, concurrency, async (e) => { const foreign = e.agencyId === employees[0].agencyId ? employees[300] : employees[0]; const r = await http(`/api/employee/payslips/${foreign.payslipId}/pdf`, cookies.get(e.authId)); await r.arrayBuffer(); ensure(r.status === 404, `Cross-agency access ${r.status}`); });
    await pool([...signed.values()], 10, async (entry) => { ok(await admin.auth.admin.signOut(entry.session.access_token, 'global'), 'Revoke local sessions'); });
  }
  manifest.testCompletedAt = new Date().toISOString(); await save();
} catch (error) { manifest.failure = error.message; process.exitCode = 1; console.error(`FAIL ${error.message}`); await save(); }
finally { if (!cleanupArg && !args.includes('--keep-fixtures')) { try { await cleanup(); } catch (error) { manifest.cleanupFailure = error.message; await save(); console.error(`CLEANUP FAIL ${error.message}`); process.exitCode = 1; } } }
if (manifest.emailDeliveryFailure || manifest.metrics.some((m) => m.errors > 0)) process.exitCode = 1;
