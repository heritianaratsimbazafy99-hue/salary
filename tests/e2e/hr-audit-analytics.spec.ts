import { expect, test } from "@playwright/test";

test("anonymous user does not see the restricted analytics shell", async ({ page }) => {
  await page.goto("/hr/analytics");
  await expect(page.getByRole("heading", { name: "Analytics paie" })).not.toBeVisible();
  await expect(page.getByText("Acces reserve RH centrale et super admin")).not.toBeVisible();
});
