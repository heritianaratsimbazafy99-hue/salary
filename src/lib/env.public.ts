import { z } from "zod";

type PublicEnvSource = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
};

export type PublicSupabaseConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  appUrl: string;
};

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const OptionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const RequiredUrlString = z.preprocess(emptyStringToUndefined, z.string().trim().url());

const PublicSupabaseConfigSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: RequiredUrlString,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: OptionalNonEmptyString,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: OptionalNonEmptyString,
    NEXT_PUBLIC_APP_URL: z.preprocess(emptyStringToUndefined, z.string().trim().url().optional()),
    NODE_ENV: z
      .preprocess(emptyStringToUndefined, z.enum(["development", "test", "production"]).optional())
      .default("development"),
  })
  .superRefine((env, context) => {
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      context.addIssue({
        code: "custom",
        message: "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY",
        path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      });
    }

    if (env.NODE_ENV === "production" && !env.NEXT_PUBLIC_APP_URL) {
      context.addIssue({
        code: "custom",
        message: "NEXT_PUBLIC_APP_URL is required in production for auth redirects",
        path: ["NEXT_PUBLIC_APP_URL"],
      });
    }
  });

function readRuntimePublicEnv(): PublicEnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function createPublicConfigError(message?: string): Error {
  return new Error(
    message
      ? `Supabase public configuration is missing or invalid: ${message}.`
      : "Supabase public configuration is missing or invalid: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export function resolvePublicSupabaseConfig(env: PublicEnvSource = readRuntimePublicEnv()): PublicSupabaseConfig {
  const result = PublicSupabaseConfigSchema.safeParse(env);

  if (!result.success) {
    const productionAppUrlIssue = result.error.issues.find((issue) =>
      issue.path.includes("NEXT_PUBLIC_APP_URL"),
    );

    throw createPublicConfigError(productionAppUrlIssue?.message);
  }

  return {
    appUrl: result.data.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    supabasePublishableKey:
      result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return resolvePublicSupabaseConfig();
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
};
