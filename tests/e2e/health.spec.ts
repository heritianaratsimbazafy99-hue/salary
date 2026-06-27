import { expect, test } from "@playwright/test";

test("health endpoint reports configured local services", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toMatchObject({
    checks: {
      app: "ok",
      email: "resend_excluded",
      supabase: "ok",
    },
    status: "ok",
  });
});
