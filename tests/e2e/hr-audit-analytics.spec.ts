import { expect, test } from "@playwright/test";

test("hr analytics page renders sensitive analytics shell", async ({ page }) => {
  await page.goto("/hr/analytics");
  await expect(page.getByRole("heading", { name: "Analytics paie" })).toBeVisible();
  await expect(page.getByText("Acces reserve RH centrale et super admin")).toBeVisible();
});
