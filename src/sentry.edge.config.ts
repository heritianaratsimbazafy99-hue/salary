import * as Sentry from "@sentry/nextjs";
import {
  getSentryEnvironment,
  getSentryTracesSampleRate,
  isSentryEnabled,
  sanitizeSentryErrorEvent,
  sanitizeSentryAuthLinks,
} from "./lib/sentry-options";

Sentry.init({
  beforeSend: sanitizeSentryErrorEvent,
  beforeSendTransaction: sanitizeSentryAuthLinks,
  beforeSendSpan: sanitizeSentryAuthLinks,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled(),
  environment: getSentryEnvironment(),
  sendDefaultPii: false,
  tracesSampleRate: getSentryTracesSampleRate(),
});
