"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Next.js server actions enforce POST and validate the request origin. */
export async function logout() {
  const cookieStore = await cookies();
  const authCookies = cookieStore.getAll().filter(({ name }) =>
    /^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(name),
  );

  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Even when Auth is unreachable, remove this browser's credentials.
  } finally {
    for (const { name } of authCookies) cookieStore.delete(name);
  }

  redirect("/auth/login");
}
