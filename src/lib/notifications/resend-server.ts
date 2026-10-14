import "server-only";

import { createHash } from "node:crypto";
import { Resend } from "resend";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { buildEmployeeActivationEmail, buildPayslipPublishedEmail } from "@/lib/notifications/resend";

const DEFAULT_APP_URL = "http://localhost:3000";
const DELIVERY_ERROR = "Le fournisseur email a refusé l'envoi.";
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 8_000;
export const EMAIL_DELIVERY_UNCONFIRMED = "EMAIL_DELIVERY_UNCONFIRMED";

export type SendPayslipPublishedEmailInput = {
  to: string;
  employeeName: string;
  invitationToken?: string;
  idempotencyKey?: string;
};
export type EmailDeliveryResult = {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
};

export class EmailDeliveryError extends Error {
  constructor(readonly deliveryUnconfirmed = false, readonly quotaExceeded = false) { super(DELIVERY_ERROR); }
}

function publishedMessage(input: SendPayslipPublishedEmailInput) {
  return {
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    ...buildPayslipPublishedEmail({
      employeeName: input.employeeName,
      invitationToken: input.invitationToken,
      appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
    }),
  };
}

function client() {
  if (!serverEnv.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required to send emails");
  return new Resend(serverEnv.RESEND_API_KEY);
}

function requestKey(prefix: string, payload: unknown) {
  // URLs and addresses must never appear in provider idempotency keys or logs.
  return `${prefix}/${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export async function sendPayslipPublishedEmail(input: SendPayslipPublishedEmailInput) {
  const resend = client();
  const message = publishedMessage(input);
  const idempotencyKey = input.idempotencyKey ?? requestKey("payslip", message);
  return sendWithRetry(() => resend.emails.send(message, requestOptions(idempotencyKey)));
}

export async function sendEmployeeActivationEmail(input: { to: string; confirmationUrl: string }) {
  const email = buildEmployeeActivationEmail({ confirmationUrl: input.confirmationUrl });
  const resend = client();
  const message = { from: serverEnv.RESEND_FROM_EMAIL, to: input.to, ...email };
  const idempotencyKey = requestKey("activation", message);
  return sendWithRetry(() => resend.emails.send(message, requestOptions(idempotencyKey)));
}

/** Each recipient gets their own private message. Strict batches preserve ID order. */
export async function sendPayslipPublishedEmails(inputs: SendPayslipPublishedEmailInput[]): Promise<EmailDeliveryResult[]> {
  if (!inputs.length) return [];
  const resend = client();
  const results: EmailDeliveryResult[] = [];
  let quotaExceeded = false;
  for (let offset = 0; offset < inputs.length; offset += 100) {
    const chunk = inputs.slice(offset, offset + 100);
    if (quotaExceeded) {
      results.push(...chunk.map(() => ({ data: null, error: { message: DELIVERY_ERROR } })));
      continue;
    }
    const messages = chunk.map(publishedMessage);
    const idempotencyKey = requestKey("payslip-batch", { messages, keys: chunk.map((input) => input.idempotencyKey ?? null) });
    try {
      const response = await sendWithRetry(() => resend.batch.send(messages, { ...requestOptions(idempotencyKey), batchValidation: "strict" }));
      const ids = response.data?.data;
      if (!Array.isArray(ids) || ids.length !== chunk.length || ids.some((entry) => typeof entry.id !== "string" || !entry.id)) {
        throw new EmailDeliveryError(true);
      }
      results.push(...ids.map((entry) => ({ data: { id: entry.id }, error: null })));
    } catch (error) {
      quotaExceeded = error instanceof EmailDeliveryError && error.quotaExceeded;
      const code = error instanceof EmailDeliveryError && error.deliveryUnconfirmed ? EMAIL_DELIVERY_UNCONFIRMED : undefined;
      results.push(...chunk.map(() => ({ data: null, error: { message: DELIVERY_ERROR, ...(code ? { code } : {}) } })));
    }
  }
  return results;
}

function requestOptions(idempotencyKey: string) {
  // The SDK passes request options to fetch. Abort each attempt rather than letting
  // a stalled provider consume the whole publication request lifetime.
  return { idempotencyKey, signal: AbortSignal.timeout(10_000) };
}

type ProviderResponse = {
  error: { name?: string; statusCode?: number | null } | null;
  headers?: Record<string, string> | null;
};

async function sendWithRetry<T extends ProviderResponse>(send: () => Promise<T>): Promise<T> {
  let unconfirmed = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let result: T;
    try { result = await send(); }
    catch {
      unconfirmed = true;
      if (attempt === MAX_ATTEMPTS - 1) throw new EmailDeliveryError(true);
      await delay(1_000 * 2 ** attempt + Math.floor(Math.random() * 250));
      continue;
    }
    if (!result.error) return result;
    const { name, statusCode } = result.error;
    const quota = name === "daily_quota_exceeded" || name === "monthly_quota_exceeded";
    const ambiguous = statusCode === null || (typeof statusCode === "number" && statusCode >= 500);
    unconfirmed ||= ambiguous;
    const retryable = !quota && (name === "rate_limit_exceeded" || name === "concurrent_idempotent_requests" || ambiguous);
    if (!retryable || attempt === MAX_ATTEMPTS - 1) throw new EmailDeliveryError(unconfirmed, quota);
    const retryAfter = Number(result.headers?.["retry-after"]);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 1_000 * 2 ** attempt + Math.floor(Math.random() * 250);
    // Do not retry early if the provider asks for a delay beyond this request's budget.
    if (waitMs > MAX_RETRY_DELAY_MS) throw new EmailDeliveryError(unconfirmed);
    await delay(waitMs);
  }
  throw new EmailDeliveryError(unconfirmed);
}

function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export type HrNotificationEmail = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; content: string }>;
};

/** HR alerts and reports. The caller supplies a stable idempotency key per logical delivery. */
export async function sendHrNotificationEmail(input: HrNotificationEmail) {
  const resend = client();
  const message = {
    from: serverEnv.RESEND_FROM_EMAIL, to: input.to, subject: input.subject, html: input.html,
    ...(input.attachments ? { attachments: input.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content, "utf8") })) } : {}),
  };
  return sendWithRetry(() => resend.emails.send(message, requestOptions(requestKey("hr-notification", input.idempotencyKey))));
}
