import type { ErrorEvent } from "@sentry/nextjs";

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-supabase-auth",
  "apikey",
]);

export function isSentryEnabled() {
  return hasValue(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export function getSentryEnvironment() {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
}

export function getSentryTracesSampleRate() {
  const rawSampleRate = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;
  if (!hasValue(rawSampleRate)) return DEFAULT_TRACES_SAMPLE_RATE;

  const sampleRate = Number(rawSampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }

  return sampleRate;
}

export function sanitizeSentryErrorEvent(event: ErrorEvent) {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.env;
    delete event.request.query_string;

    if (event.request.url) {
      event.request.url = stripUrlSecrets(event.request.url);
    }

    if (event.request.headers) {
      for (const headerName of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(headerName.toLowerCase())) {
          delete event.request.headers[headerName];
        }
      }
    }
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  return event;
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function stripUrlSecrets(value: string) {
  try {
    const url = new URL(value, "https://app.local");
    url.search = "";
    url.hash = "";

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return url.toString();
    }

    return url.pathname;
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}
