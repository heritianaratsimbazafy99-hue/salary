import * as Sentry from "@sentry/nextjs";
import {
  getSentryEnvironment,
  getSentryTracesSampleRate,
  isSentryEnabled,
  sanitizeSentryErrorEvent,
} from "./lib/sentry-options";

Sentry.init({
  beforeSend: sanitizeSentryErrorEvent,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled(),
  environment: getSentryEnvironment(),
  sendDefaultPii: false,
  tracesSampleRate: getSentryTracesSampleRate(),
});
