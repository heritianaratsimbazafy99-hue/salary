import "server-only";

import { Resend } from "resend";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { buildEmployeeActivationEmail, buildPayslipPublishedEmail } from "@/lib/notifications/resend";

const DEFAULT_APP_URL = "http://localhost:3000";

type SendPayslipPublishedEmailInput = {
  to: string;
  employeeName: string;
  invitationToken?: string;
};

export async function sendPayslipPublishedEmail(input: SendPayslipPublishedEmailInput) {
  const email = buildPayslipPublishedEmail({
    employeeName: input.employeeName,
    invitationToken: input.invitationToken,
    appUrl: publicEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
  });

  return sendEmail(input.to, email);
}

export async function sendEmployeeActivationEmail(input: { to: string; confirmationUrl: string }) {
  const email = buildEmployeeActivationEmail({ confirmationUrl: input.confirmationUrl });
  return sendEmail(input.to, email);
}

async function sendEmail(to: string, email: { subject: string; html: string }) {
  if (!serverEnv.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send emails");
  }

  const resend = new Resend(serverEnv.RESEND_API_KEY);
  try {
    const result = await resend.emails.send({
      from: serverEnv.RESEND_FROM_EMAIL,
      to,
      subject: email.subject,
      html: email.html,
    });
    if (result.error) throw new Error("Provider rejected email");
    return result;
  } catch {
    // Provider errors may contain request details, including private activation URLs.
    throw new Error("Le fournisseur email a refusé l'envoi.");
  }
}
