import { expect, test } from "@playwright/test";

test("anonymous user is sent to login instead of the manager import space", async ({ page }) => {
  await page.goto("/manager/imports");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imports de paie" })).not.toBeVisible();
});

test("anonymous user is sent to login instead of an import report", async ({ page }) => {
  await page.goto("/manager/imports/00000000-0000-0000-0000-000000000301");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rapport d'import" })).not.toBeVisible();
});
