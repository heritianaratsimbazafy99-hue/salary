#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const REQUIRED_PUBLIC_KEY_NAMES = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
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

  console.log("Production environment validation passed. Resend is intentionally excluded.");
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

  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hasValue(publicKey) && hasValue(env.SUPABASE_SERVICE_ROLE_KEY) && publicKey === env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY must not equal the public Supabase key.");
  }

  return {
    errors,
    ok: errors.length === 0,
  };
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
