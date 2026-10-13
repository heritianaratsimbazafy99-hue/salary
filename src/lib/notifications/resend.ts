const DEFAULT_APP_URL = "http://localhost:3000";
const PAYSLIP_PATH = "/employee/payslips";

type PayslipPublishedEmailInput = {
  employeeName: string;
  appUrl: string;
  invitationToken?: string;
};

export function buildPayslipPublishedEmail(input: PayslipPublishedEmailInput) {
  if (input.invitationToken) {
    const invitationUrl = new URL("/auth/invitation", safeAppOrigin(input.appUrl));
    invitationUrl.searchParams.set("token", input.invitationToken);
    return {
      subject: "Activez votre espace salarié MadajobPay",
      html: `<p>Bonjour ${escapeHtml(input.employeeName)},</p><p>Votre première fiche de paie est disponible. Activez votre espace sécurisé pour la consulter.</p><p><a href="${escapeHtml(invitationUrl.toString())}">Activer mon espace salarié</a></p><p>Ce lien personnel est valable 14 jours. Un lien de confirmation sera envoyé à cette adresse email.</p>`,
    };
  }
  const payslipUrl = buildPayslipUrl(input.appUrl);

  return {
    subject: "Nouvelle fiche de paie disponible",
    html: `<p>Bonjour ${escapeHtml(input.employeeName)},</p><p>Une nouvelle fiche de paie interne est disponible dans votre espace securise.</p><p><a href="${escapeHtml(payslipUrl)}">Ouvrir mon espace</a></p>`,
  };
}

export function buildEmployeeActivationEmail(input: { confirmationUrl: string }) {
  let confirmationUrl: URL;
  try {
    confirmationUrl = new URL(input.confirmationUrl);
  } catch {
    throw new Error("Lien de confirmation invalide.");
  }
  const secureProtocol = confirmationUrl.protocol === "https:" ||
    (confirmationUrl.protocol === "http:" && isLocalDevelopmentHost(confirmationUrl.hostname));
  if (!secureProtocol || confirmationUrl.username || confirmationUrl.password ||
      confirmationUrl.pathname !== "/auth/callback" || !confirmationUrl.searchParams.get("token_hash")) {
    throw new Error("Lien de confirmation invalide.");
  }

  return {
    subject: "Confirmez votre accès à MadajobPay",
    html: `<p>Bonjour,</p><p>Confirmez votre adresse email pour activer votre espace salarié sécurisé.</p><p><a href="${escapeHtml(confirmationUrl.toString())}">Confirmer mon accès</a></p><p>Ce lien est valable 15 minutes. Ouvrez ce lien dans le navigateur utilisé pour demander votre activation. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`,
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
