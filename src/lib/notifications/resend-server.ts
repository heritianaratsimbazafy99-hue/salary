import "server-only";

import { Resend } from "resend";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { buildPayslipPublishedEmail } from "@/lib/notifications/resend";

const DEFAULT_APP_URL = "http://localhost:3000";

type SendPayslipPublishedEmailInput = {
  to: string;
  employeeName: string;
};

export async function sendPayslipPublishedEmail(input: SendPayslipPublishedEmailInput) {
  if (!serverEnv.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send emails");
  }

  const resend = new Resend(serverEnv.RESEND_API_KEY);
  const email = buildPayslipPublishedEmail({
    employeeName: input.employeeName,
    appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
  });

  return resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    subject: email.subject,
    html: email.html,
  });
}
