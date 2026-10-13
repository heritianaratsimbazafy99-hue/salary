"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  INVITATION_CONTEXT_COOKIE,
  INVITATION_CONTEXT_MAX_AGE,
  isInvitationToken,
  requestEmployeeActivation,
} from "@/lib/employees/activation";
import { getPublicSupabaseConfig } from "@/lib/env.public";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivationFormState = { status: string };

export async function activateEmployee(
  _previous: ActivationFormState,
  formData: FormData,
): Promise<ActivationFormState> {
  const token = formData.get("token");
  const email = z.string().trim().email().max(254).safeParse(formData.get("email"));
  if (!isInvitationToken(token)) return { status: "unavailable" };
  if (!email.success) return { status: "invalid_email" };

  try {
    const { appUrl } = getPublicSupabaseConfig();
    const cookieStore = await cookies();
    // Keep the last usable context if a resend is throttled or delivery fails.
    const result = await requestEmployeeActivation(
      { token, email: email.data, appUrl },
      createAdminClient(),
    );

    if (result.status === "sent" && result.context) {
      cookieStore.set(INVITATION_CONTEXT_COOKIE, result.context, {
        httpOnly: true,
        secure: new URL(appUrl).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: INVITATION_CONTEXT_MAX_AGE,
      });
    }
    return { status: result.status };
  } catch {
    return { status: "send_failed" };
  }
}
