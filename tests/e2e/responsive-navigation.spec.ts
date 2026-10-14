import { expect, test, type Locator, type Page } from "@playwright/test";

import { createHrE2EFixture, signInAsE2EUser } from "./helpers/supabase-fixtures";

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

async function expectInsideViewport(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test("login exposes one meaningful h1 on mobile and desktop", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/auth/login");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText("Connexion à MadajobPay");
    await expect(heading).toBeVisible();
    await expectNoDocumentOverflow(page);
  }
});

for (const role of ["hr", "superAdmin"] as const) {
  test(`${role} navigation, long audit labels and guide fit small mobile screens`, async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await createHrE2EFixture();
    const action = "PAYROLL_IMPORT_MAPPING_RESOLVED";
    try {
      const { error } = await fixture.admin.from("audit_logs").insert({
        actor_profile_id: fixture[role].id,
        actor_role: fixture[role].role,
        agency_id: fixture.agencyId,
        action,
        resource_type: "payroll_import_mapping_with_a_long_resource_name",
      });
      expect(error).toBeNull();
      await signInAsE2EUser(page, {
        email: fixture[role].email,
        password: fixture.password,
        targetPath: "/hr/audit",
        expectedPath: /\/hr\/audit$/,
      });

      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/hr/audit");
        const actionLabel = page.getByText(action, { exact: true }).first();
        await expect(actionLabel).toBeVisible();
        await expectInsideViewport(actionLabel, width);
        await expectNoDocumentOverflow(page);
        const nav = page.getByRole("navigation", { name: "Navigation principale" });
        if (width < 1024) {
          const controls = nav.locator("a:visible, button:visible");
          await expect(controls).toHaveCount(5);
          for (const control of await controls.all()) {
            await expectInsideViewport(control, width);
            const box = await control.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(44);
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }

          const more = nav.getByRole("button", { name: "Plus", exact: true });
          await more.focus();
          await page.keyboard.press("Enter");
          const panel = nav.locator("#nav-more");
          await expect(panel.getByRole("link").first()).toBeFocused();
          const expectedPaths = [
            "/hr/requests", "/hr/analytics", "/hr/exports", "/hr/agencies", "/hr/organisation", "/hr/users",
            ...(role === "superAdmin" ? ["/hr/access"] : []),
            "/hr/audit", ...(role === "superAdmin" ? ["/hr/operations"] : []), "/help",
          ];
          expect(await panel.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(expectedPaths);
          await page.keyboard.press("Escape");
          await expect(panel).toHaveCount(0);
          await expect(more).toBeFocused();

          await page.keyboard.press("Enter");
          const guide = panel.getByRole("link", { name: "Guide", exact: true });
          // Walk the whole sheet with Tab to verify that every destination is keyboard reachable.
          for (let index = 1; index < expectedPaths.length; index += 1) await page.keyboard.press("Tab");
          await expect(guide).toBeFocused();
          await page.keyboard.press("Enter");
        } else {
          await expect(nav.getByRole("button", { name: "Plus", exact: true })).toHaveCount(0);
          await nav.getByRole("link", { name: "Guide", exact: true }).click();
        }
        await expect(page).toHaveURL(/\/help$/);
        await expect(page.getByRole("heading", { name: "Guide d’utilisation", level: 1 })).toBeVisible();
        await expect(nav.locator("#nav-more")).toHaveCount(0);
        await expectNoDocumentOverflow(page);
        const support = page.locator("#aide");
        await support.scrollIntoViewIfNeeded();
        await expectInsideViewport(support, width);
        await expectInsideViewport(support.getByRole("link", { name: "heritiana.ratsimbazafy99@gmail.com", exact: true }), width);
      }
    } finally {
      await fixture.cleanup();
    }
  });
}
