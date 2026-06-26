import { expect, test } from "@playwright/test";

test("employee payslip page renders current payslip shell", async ({ page }) => {
  await page.goto("/employee/payslips");
  await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).toBeVisible();
  await expect(page.getByText("Version actuellement publiee")).toBeVisible();
  await expect(page.getByText("Aucun element de paie publie pour cette periode.")).toBeVisible();
});
