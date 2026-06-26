export function buildMagicLinkOtpOptions(appUrl: string): {
  emailRedirectTo: string;
  shouldCreateUser: false;
} {
  return {
    emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
    shouldCreateUser: false,
  };
}
