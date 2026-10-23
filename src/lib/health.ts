export function resolveEmailCheck(env: NodeJS.ProcessEnv = process.env): "configured" | "missing" {
  return hasValue(env.RESEND_API_KEY) && hasValue(env.RESEND_FROM_EMAIL) ? "configured" : "missing";
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
