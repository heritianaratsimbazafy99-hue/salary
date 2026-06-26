import { expect, test } from "@playwright/test";

test("manager import page renders upload workflow shell", async ({ page }) => {
  await page.goto("/manager/imports");
  await expect(page.getByRole("heading", { name: "Imports de paie" })).toBeVisible();

  const stepper = page.getByRole("list", { name: "Progression import" });
  await expect(stepper.getByRole("listitem")).toHaveText([
    "Upload",
    "Mapping",
    "Validation",
    "Invitations",
    "Previsualisation",
    "Publication",
  ]);
  await expect(stepper.locator('[aria-current="step"]')).toHaveText("Upload");
});

test("manager import detail page renders validation report shell", async ({ page }) => {
  await page.goto("/manager/imports/import-test");
  await expect(page.getByRole("heading", { name: "Rapport d'import" })).toBeVisible();

  const stepper = page.getByRole("list", { name: "Progression import" });
  await expect(stepper.locator('[aria-current="step"]')).toHaveText("Validation");

  await expect(page.getByText("Lignes valides", { exact: true })).toBeVisible();
  await expect(page.getByText("Lignes en erreur", { exact: true })).toBeVisible();
  await expect(page.getByText("Salaries inconnus", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucune erreur detectee.")).toBeVisible();
});
