const DEFAULT_APP_URL = "http://localhost:3000";
const PAYSLIP_PATH = "/employee/payslips";

type PayslipPublishedEmailInput = {
  employeeName: string;
  appUrl: string;
};

type SendPayslipPublishedEmailInput = {
  to: string;
  employeeName: string;
};

export function buildPayslipPublishedEmail(input: PayslipPublishedEmailInput) {
  const payslipUrl = buildPayslipUrl(input.appUrl);

  return {
    subject: "Nouvelle fiche de paie disponible",
    html: `<p>Bonjour ${escapeHtml(input.employeeName)},</p><p>Une nouvelle fiche de paie interne est disponible dans votre espace securise.</p><p><a href="${escapeHtml(payslipUrl)}">Ouvrir mon espace</a></p>`,
  };
}

export async function sendPayslipPublishedEmail(input: SendPayslipPublishedEmailInput) {
  const [{ Resend }, { publicEnv }, { serverEnv }] = await Promise.all([
    import("resend"),
    import("@/lib/env.public"),
    import("@/lib/env.server"),
  ]);

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

function buildPayslipUrl(appUrl: string) {
  return new URL(PAYSLIP_PATH, safeAppOrigin(appUrl)).toString();
}

function safeAppOrigin(appUrl: string) {
  try {
    const url = new URL(appUrl.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_APP_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
