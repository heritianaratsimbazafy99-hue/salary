import { expect, test } from "@playwright/test";

test("manager import page renders upload workflow shell", async ({ page }) => {
  await page.goto("/manager/imports");
  await expect(page.getByRole("heading", { name: "Imports de paie" })).toBeVisible();
  await expect(page.getByText("Upload")).toBeVisible();
  await expect(page.getByText("Mapping")).toBeVisible();
  await expect(page.getByText("Validation")).toBeVisible();
  await expect(page.getByText("Publication")).toBeVisible();
});
