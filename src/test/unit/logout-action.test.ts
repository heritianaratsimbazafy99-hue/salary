import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  deleteCookie: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [
      { name: "sb-project-auth-token.0", value: "secret" },
      { name: "sb-project-auth-token.1", value: "secret" },
      { name: "sb-project-auth-token-code-verifier", value: "secret" },
      { name: "preferences", value: "keep" },
    ],
    delete: mocks.deleteCookie,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { logout } from "@/app/auth/logout/actions";

describe("logout server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.redirect.mockImplementation((href) => { throw new Error(`REDIRECT:${href}`); });
  });

  it.each(["success", "returned error", "network error", "client error"])(
    "clears every auth cookie and redirects after %s",
    async (scenario) => {
      if (scenario === "returned error") mocks.signOut.mockResolvedValue({ error: new Error("Auth offline") });
      if (scenario === "network error") mocks.signOut.mockRejectedValue(new Error("Network unavailable"));
      if (scenario === "client error") mocks.createClient.mockRejectedValue(new Error("Config unavailable"));

      await expect(logout()).rejects.toThrow("REDIRECT:/auth/login");
      if (scenario !== "client error") expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(mocks.deleteCookie.mock.calls.map(([name]) => name)).toEqual([
        "sb-project-auth-token.0", "sb-project-auth-token.1", "sb-project-auth-token-code-verifier",
      ]);
    },
  );
});
