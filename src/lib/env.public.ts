import { z } from "zod";

type PublicEnvSource = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
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
    NEXT_PUBLIC_APP_URL: z
      .preprocess(emptyStringToUndefined, z.string().trim().url().optional())
      .default("http://localhost:3000"),
  })
  .superRefine((env, context) => {
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      context.addIssue({
        code: "custom",
        message: "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY",
        path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      });
    }
  });

function readRuntimePublicEnv(): PublicEnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function createPublicConfigError(): Error {
  return new Error(
    "Supabase public configuration is missing or invalid: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export function resolvePublicSupabaseConfig(env: PublicEnvSource = readRuntimePublicEnv()): PublicSupabaseConfig {
  const result = PublicSupabaseConfigSchema.safeParse(env);

  if (!result.success) {
    throw createPublicConfigError();
  }

  return {
    appUrl: result.data.NEXT_PUBLIC_APP_URL,
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
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
