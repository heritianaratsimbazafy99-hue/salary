import "server-only";

import { z } from "zod";
import { publicEnv } from "./env.public";

type ServerEnvSource = {
  [key: string]: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const ServerOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  RESEND_FROM_EMAIL: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).default("Paie Interne <no-reply@example.com>"),
  ),
});

export function resolveServerEnv(env: ServerEnvSource = process.env) {
  return {
    ...publicEnv,
    ...ServerOnlyEnvSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      RESEND_API_KEY: env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
    }),
  };
}

export function requireSupabaseServiceRoleKey(env: ServerEnvSource = process.env): string {
  const { SUPABASE_SERVICE_ROLE_KEY } = resolveServerEnv(env);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the Supabase admin client.");
  }

  return SUPABASE_SERVICE_ROLE_KEY;
}

export const serverEnv = {
  ...resolveServerEnv(),
};
