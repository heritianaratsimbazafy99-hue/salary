const DEFAULT_APP_URL = "http://localhost:3000";
const PAYSLIP_PATH = "/employee/payslips";

type PayslipPublishedEmailInput = {
  employeeName: string;
  appUrl: string;
};

export function buildPayslipPublishedEmail(input: PayslipPublishedEmailInput) {
  const payslipUrl = buildPayslipUrl(input.appUrl);

  return {
    subject: "Nouvelle fiche de paie disponible",
    html: `<p>Bonjour ${escapeHtml(input.employeeName)},</p><p>Une nouvelle fiche de paie interne est disponible dans votre espace securise.</p><p><a href="${escapeHtml(payslipUrl)}">Ouvrir mon espace</a></p>`,
  };
}

function buildPayslipUrl(appUrl: string) {
  return new URL(PAYSLIP_PATH, safeAppOrigin(appUrl)).toString();
}

function safeAppOrigin(appUrl: string) {
  try {
    const url = new URL(appUrl.trim());

    if (url.protocol === "https:") {
      return url.origin;
    }

    if (url.protocol === "http:" && isLocalDevelopmentHost(url.hostname)) {
      return url.origin;
    }

    return DEFAULT_APP_URL;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function isLocalDevelopmentHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]"
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
