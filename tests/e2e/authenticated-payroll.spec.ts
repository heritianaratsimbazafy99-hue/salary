import { expect, test } from "@playwright/test";

import {
  acceptEmployeeInvitationForE2E,
  appUrl,
  createPayrollE2EFixture,
  createPayrollWorkbook,
  signInAsE2EUser,
} from "./helpers/supabase-fixtures";

test("manager publishes a payroll import and employee/HR can see it", async ({ page }, testInfo) => {
  const fixture = await createPayrollE2EFixture();

  try {
    const workbookPath = await createPayrollWorkbook(testInfo, {
      employeeEmail: fixture.employeeEmail,
      periodEnd: fixture.periodEnd,
      periodStart: fixture.periodStart,
      suffix: fixture.suffix,
    });

    await signInAsE2EUser(page, {
      email: fixture.manager.email,
      expectedPath: /\/manager\/imports$/,
      password: fixture.password,
      targetPath: "/manager/imports",
    });

    await expect(page.getByRole("heading", { name: "Imports de paie" })).toBeVisible();
    await page.getByLabel("Debut de periode").fill(fixture.periodStart);
    await page.getByLabel("Fin de periode").fill(fixture.periodEnd);
    await page.getByLabel("Fichier Excel").setInputFiles(workbookPath);
    await page.getByRole("button", { name: "Importer" }).click();

    await page.waitForURL(/\/manager\/imports\/[0-9a-f-]+$/);
    const importId = page.url().split("/").at(-1);
    expect(importId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Rapport d'import" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mapping des colonnes" })).toBeVisible();
    await expect(page.getByText("cafeteria")).toBeVisible();

    await page.getByLabel("Categorie").selectOption("BENEFIT");
    await page.getByRole("button", { name: "Enregistrer les mappings" }).click();
    await expect(page.getByRole("button", { name: "Publier" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.locator('[aria-current="step"]').filter({ hasText: "Publication" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Publier" })).toHaveCount(0);

    const { data: payrollImport } = await fixture.admin
      .from("payroll_imports")
      .select("status")
      .eq("id", importId)
      .single();
    expect(payrollImport?.status).toBe("PUBLISHED");

    const managerExport = await page.context().request.post(appUrl("/api/exports"), {
      data: { agencyId: fixture.agencyId, exportType: "IMPORT_REPORT" },
    });
    expect(managerExport.status()).toBe(200);
    expect(await managerExport.text()).toContain(importId);

    await acceptEmployeeInvitationForE2E(fixture.admin, {
      agencyId: fixture.agencyId,
      employeeEmail: fixture.employeeEmail,
      fullName: "Rina Salary",
      password: fixture.password,
    });

    await signInAsE2EUser(page, {
      email: fixture.employeeEmail,
      expectedPath: /\/employee\/payslips$/,
      password: fixture.password,
      targetPath: "/employee/payslips",
    });
    await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).toBeVisible();
    await expect(page.getByText("Rina Salary")).toBeVisible();
    await expect(page.getByText("cafeteria")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historique publié" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger CSV" })).toBeVisible();
    const employeeExport = await page.context().request.get(appUrl("/api/employee/payslips/export"));
    expect(employeeExport.status()).toBe(200);
    expect(await employeeExport.text()).toContain("Rina Salary");

    await signInAsE2EUser(page, {
      email: fixture.hr.email,
      expectedPath: /\/hr\/analytics$/,
      password: fixture.password,
      targetPath: "/hr/analytics",
    });
    await expect(page.getByRole("heading", { name: "Analytics paie" })).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(`Codex Audit ${fixture.suffix} Rina Salary`) }),
    ).toBeVisible();
    const hrExport = await page.context().request.post(appUrl("/api/exports"), {
      data: { agencyId: fixture.agencyId, exportType: "PUBLISHED_PAYSLIPS" },
    });
    expect(hrExport.status()).toBe(200);
    expect(await hrExport.text()).toContain("Rina Salary");

    await page.goto(appUrl("/hr/audit"));
    await expect(page.getByRole("heading", { name: "Journal d'audit" })).toBeVisible();
    await expect(page.getByText("PAYROLL_IMPORT_PUBLISHED")).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
