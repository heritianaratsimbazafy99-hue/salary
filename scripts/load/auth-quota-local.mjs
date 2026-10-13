#!/usr/bin/env node
// Probe Auth's actual verification quota from one local source IP. No email is sent.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
if (!process.argv.includes('--local-only')) throw new Error('--local-only required');
const url = 'http://127.0.0.1:55421';
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
if (new URL(status.API_URL).origin !== url) throw new Error('Local target mismatch');
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, status.SERVICE_ROLE_KEY, authOptions);
const run = randomUUID();
const output = path.resolve(process.argv.find((x) => x.startsWith('--output='))?.slice(9) || `test-results/auth-quota-${run}`);
await fs.mkdir(output, { recursive: true });
const users = [];
const report = { runId: run, api: url, startedAt: new Date().toISOString(), count: 340, concurrency: 340, sourceIPs: 1, note: 'Only OTP verification; generateLink creates private test tokens without email delivery. HTTP 429 identifies a quota rejection; other errors are recorded separately.', users, quota: [] };
try { const env = JSON.parse(execFileSync('docker', ['inspect', 'supabase_auth_salary-platform', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' })); report.poolOverride = execFileSync('docker', ['exec', 'supabase_auth_salary-platform', 'sh', '-c', 'if test -f /.env; then cat /.env; fi'], { encoding: 'utf8' }).split('\n').filter((v) => /^GOTRUE_DB_MAX_(IDLE_)?POOL_SIZE=/.test(v)); report.quota = env.filter((v) => /^GOTRUE_RATE_LIMIT_(VERIFY|OTP|TOKEN_REFRESH|EMAIL_SENT)=/.test(v)); } catch { report.quota = ['unavailable']; }
async function save() { await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
async function pool(items, count, fn) { let index = 0; const results = new Array(items.length); await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => { while (index < items.length) { const i = index++; results[i] = await fn(items[i], i); } })); return results; }
function check(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
try {
  const hashes = await pool(Array.from({ length: 340 }), 5, async (_, i) => { const email = `auth-capacity-${run}-${i}@example.com`; const user = check(await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { auth_capacity_run: run } }), 'Create local Auth').user; users.push({ id: user.id, email }); const link = check(await admin.auth.admin.generateLink({ email, type: 'magiclink' }), 'Generate local token'); return link.properties.hashed_token; });
  await save();
  const start = performance.now();
  const results = await pool(hashes, 340, async (hash) => { const begin = performance.now(); const client = createClient(url, status.PUBLISHABLE_KEY || status.ANON_KEY, authOptions); const response = await client.auth.verifyOtp({ type: 'email', token_hash: hash }); return { status: response.error?.status || 200, code: response.error?.code, ms: performance.now() - begin }; });
  const times = results.map((x) => x.ms).sort((a,b) => a-b);
  report.result = { elapsedMs: Math.round(performance.now() - start), p50Ms: Math.round(times[Math.ceil(times.length * .5)-1]), p95Ms: Math.round(times[Math.ceil(times.length * .95)-1]), statuses: results.reduce((out, x) => { out[x.status] = (out[x.status] || 0) + 1; return out; }, {}), errorCodes: [...new Set(results.map((x) => x.code).filter(Boolean))] }; console.log(JSON.stringify({ ...report, users: undefined }, null, 2));
} catch (e) { report.failure = e.message; console.error(e.message); process.exitCode = 1; }
finally {
  const deleted = await pool(users, 5, async (user) => { const found = await admin.auth.admin.getUserById(user.id); if (!found.error && found.data.user.user_metadata.auth_capacity_run !== run) throw new Error('Cleanup identity mismatch'); check(await admin.auth.admin.deleteUser(user.id), 'Delete local Auth'); const verify = await admin.auth.admin.getUserById(user.id); return verify.error?.status === 404; }); report.cleaned = deleted.every(Boolean); await save(); if (!report.cleaned) process.exitCode = 1;
}
