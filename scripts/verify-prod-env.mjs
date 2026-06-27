#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const REQUIRED_PUBLIC_KEY_NAMES = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateProductionEnv(process.env);

  if (!result.ok) {
    console.error("Production environment validation failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Production environment validation passed.");
}

export function validateProductionEnv(env) {
  const errors = [];

  for (const name of requiredVars) {
    if (!hasValue(env[name])) {
      errors.push(`${name} is required.`);
    }
  }

  if (!REQUIRED_PUBLIC_KEY_NAMES.some((name) => hasValue(env[name]))) {
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
  }

  validateHttpsUrl(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL", errors);
  validateHttpsUrl(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL", errors);
  validateHttpsUrl(env.NEXT_PUBLIC_SENTRY_DSN, "NEXT_PUBLIC_SENTRY_DSN", errors);
  validateSentrySampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, errors);

  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hasValue(publicKey) && hasValue(env.SUPABASE_SERVICE_ROLE_KEY) && publicKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY must not equal the public Supabase key.");
  }

  if (hasValue(env.SENTRY_AUTH_TOKEN) && !/^sntrys_[A-Za-z0-9_+/=-]{20,}$/.test(env.SENTRY_AUTH_TOKEN)) {
    errors.push("SENTRY_AUTH_TOKEN must be a Sentry organization auth token and must stay server/build-only.");
  }

  validateResendApiKey(env.RESEND_API_KEY, errors);
  validateResendFromEmail(env.RESEND_FROM_EMAIL, errors);

  return {
    errors,
    ok: errors.length === 0,
  };
}

function validateSentrySampleRate(value, errors) {
  if (!hasValue(value)) return;

  const sampleRate = Number(value);
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    errors.push("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.");
  }
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateHttpsUrl(value, name, errors) {
  if (!hasValue(value)) return;

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} must be a valid URL.`);
    return;
  }

  if (url.protocol !== "https:") {
    errors.push(`${name} must use https in production.`);
  }

  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname)) {
    errors.push(`${name} must not point to a local host in production.`);
  }
}

function validateResendApiKey(value, errors) {
  if (!hasValue(value)) return;

  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(value.trim())) {
    errors.push("RESEND_API_KEY must be a Resend API key that starts with re_ and must stay server-only.");
  }
}

function validateResendFromEmail(value, errors) {
  if (!hasValue(value)) return;

  const address = extractEmailAddress(value);

  if (!isEmailAddress(address)) {
    errors.push("RESEND_FROM_EMAIL must be a valid sender email or Name <email> value.");
    return;
  }

  const normalizedAddress = address.toLowerCase();
  const domain = normalizedAddress.split("@").at(-1);

  if (domain === "example.com" || normalizedAddress === "onboarding@resend.dev") {
    errors.push("RESEND_FROM_EMAIL must use a verified production sender, not example.com or onboarding@resend.dev.");
  }
}

function extractEmailAddress(value) {
  const trimmed = value.trim();
  const angleAddress = trimmed.match(/<([^<>]+)>$/);

  return (angleAddress?.[1] ?? trimmed).trim();
}

function isEmailAddress(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}
