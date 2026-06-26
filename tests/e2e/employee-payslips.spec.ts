import { expect, test } from "@playwright/test";

test("anonymous user is sent to login instead of the employee payslip space", async ({ page }) => {
  await page.goto("/employee/payslips");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).not.toBeVisible();
});
