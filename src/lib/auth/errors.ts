// Classify provider errors without exposing their messages or private URLs.
export function isAuthRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; code?: unknown };
  return value.status === 429 || value.code === "over_request_rate_limit" ||
    value.code === "over_email_send_rate_limit";
}

export function magicLinkFailureCode(error: unknown): "otp_failed" | "otp_rate_limited" {
  return isAuthRateLimitError(error) ? "otp_rate_limited" : "otp_failed";
}
