"use client";

import { useEffect } from "react";

import { isAppRole } from "@/lib/admin/permissions";
import type { AppRole } from "@/lib/roles";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const ROLE_REDIRECTS: Record<AppRole, string> = {
  agency_manager: "/manager/imports",
  employee: "/employee/payslips",
  hr_central: "/hr/analytics",
  super_admin: "/hr/analytics",
};

export function MagicLinkHashHandler() {
  useEffect(() => {
    let isMounted = true;
    let isEstablishing = false;
    const supabase = createBrowserSupabaseClient();

    function readSessionTokens() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const search = new URLSearchParams(window.location.search);
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = search.get("code");

      if ((!accessToken || !refreshToken) && !code) return null;

      const sanitizedUrl = new URL(window.location.href);
      sanitizedUrl.hash = "";
      sanitizedUrl.searchParams.delete("code");
      window.history.replaceState(null, "", `${sanitizedUrl.pathname}${sanitizedUrl.search}`);

      return {
        accessToken,
        code,
        refreshToken,
      };
    }

    async function establishSession() {
      if (isEstablishing) return;

      const sessionTokens = readSessionTokens();
      if (!sessionTokens) return;

      isEstablishing = true;

      try {
        const { error } =
          sessionTokens.code != null
            ? await supabase.auth.exchangeCodeForSession(sessionTokens.code)
            : await supabase.auth.setSession({
                access_token: sessionTokens.accessToken ?? "",
                refresh_token: sessionTokens.refreshToken ?? "",
              });

        if (error || !isMounted) return;

        const { data: userData } = await supabase.auth.getUser();
        const authUserId = userData.user?.id;
        let redirectPath = "/";

        if (authUserId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("auth_user_id", authUserId)
            .single();

          if (isAppRole(profile?.role)) {
            redirectPath = ROLE_REDIRECTS[profile.role];
          }
        }

        window.location.replace(redirectPath);
      } finally {
        isEstablishing = false;
      }
    }

    const handleHashChange = () => {
      void establishSession();
    };

    void establishSession();
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      isMounted = false;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return null;
}
