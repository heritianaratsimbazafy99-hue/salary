import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import ExcelJS from "exceljs";

import { readInvitationEmail } from "./helpers/mail";
import {
  acceptEmployeeInvitationForE2E,
  appUrl,
  createPayrollE2EFixture,
  signInAsE2EUser,
  type PayrollE2EFixture,
} from "./helpers/supabase-fixtures";

const june = { periodStart: "2026-06-01", periodEnd: "2026-06-30" };
const july = { periodStart: "2026-07-01", periodEnd: "2026-07-31" };
type Period = typeof june;

// All recipients use isolated example.com addresses and the Playwright local Resend sink.
// This suite deliberately publishes at most 101 recipients; the 2000-row boundary only imports.
test("launch: corrected and reimported months remain isolated, downloadable and inaccessible after logout", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createPayrollE2EFixture();
  const recipients = recipientRows(fixture, 2);
  try {
    await signInManager(page, fixture);
    const juneId = await uploadWorkbook(page, testInfo, fixture, june, recipients);
    const beforeCorrection = await page.request.get(appUrl(`/api/imports/${juneId}/review`));
    expect(beforeCorrection.status()).toBe(200);
    const staleReview = await beforeCorrection.json() as { data: { fingerprint: string } };
    expect((await page.request.post(appUrl(`/api/imports/${juneId}/publish`), { data: {} })).status()).toBe(422);
    await page.getByRole("button", { name: "Corriger Recette 0001", exact: true }).click();
    await page.getByLabel("Net", { exact: true }).fill("1200000");
    await page.getByLabel("Retenues", { exact: true }).fill("300000");
    await page.getByLabel("Motif", { exact: true }).fill("Correction validée par RH avant publication");
    const correctionResponse = page.waitForResponse((response) => response.url().includes(`/api/imports/${juneId}/rows/`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Enregistrer la correction", exact: true }).click();
    expect((await correctionResponse).status()).toBe(200);
    const corrected = await importRow(fixture, juneId, recipients[0].employeeId);
    expect(corrected.normalized_data.netAmount).toBe(1_200_000);
    expect(corrected.has_manual_adjustments).toBe(true);
    const stalePublication = await page.request.post(appUrl(`/api/imports/${juneId}/publish`), {
      data: { confirmed: true, fingerprint: staleReview.data.fingerprint },
    });
    expect(stalePublication.status()).toBe(409);
    await publishViaReview(page, fixture, juneId);

    const correctionDenied = await page.request.patch(appUrl(`/api/imports/${juneId}/rows/${corrected.id}`), {
      data: { expectedUpdatedAt: corrected.updated_at, changes: { netAmount: 1 }, reason: "Must not modify a published row" },
    });
    expect(correctionDenied.status()).toBe(409);
    const republishDenied = await page.request.post(appUrl(`/api/imports/${juneId}/publish`), {
      data: { confirmed: true, fingerprint: "0".repeat(32) },
    });
    expect(republishDenied.status()).toBe(409);

    await acceptEmployeeInvitationForE2E(fixture.admin, {
      agencyId: fixture.agencyId, employeeEmail: fixture.employeeEmail,
      fullName: recipients[0].name, password: fixture.password,
    });
    const julyId = await uploadWorkbook(page, testInfo, fixture, july, recipients.slice(0, 1));
    await publishViaReview(page, fixture, julyId);
    const replacementId = await uploadWorkbook(page, testInfo, fixture, june, recipients.slice(0, 1), 1_100_000);
    await publishViaReview(page, fixture, replacementId);

    const { data: versions, error: versionError } = await fixture.admin.from("payslip_versions")
      .select("id,payslip_id,version_number,snapshot_data,import_id").eq("agency_id", fixture.agencyId);
    expect(versionError).toBeNull();
    const first = versions!.find((version) => version.import_id === juneId && version.snapshot_data.employeeId === recipients[0].employeeId);
    const replacement = versions!.find((version) => version.import_id === replacementId);
    expect(first?.snapshot_data.netAmount).toBe(1_200_000);
    expect(replacement?.version_number).toBe(2);
    expect(replacement?.payslip_id).toBe(first?.payslip_id);
    const foreign = versions!.find((version) => version.snapshot_data.employeeId === recipients[1].employeeId);
    expect(foreign).toBeDefined();
    const { data: current } = await fixture.admin.from("payslips").select("current_version_id").eq("id", replacement!.payslip_id).single();
    expect(current?.current_version_id).toBe(replacement!.id);

    await signInAsE2EUser(page, {
      email: fixture.employeeEmail, password: fixture.password,
      expectedPath: /\/employee\/payslips$/, targetPath: "/employee/payslips",
    });
    await expect(page.getByRole("link", { name: /2026-07-01 - 2026-07-31/ })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: /2026-06-01 - 2026-06-30/ }).click();
    await expect(page.getByRole("link", { name: /2026-06-01 - 2026-06-30/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Télécharger PDF" })).toHaveAttribute("href", `/api/employee/payslips/${replacement!.payslip_id}/pdf`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Télécharger PDF" }).click();
    const downloaded = await downloadPromise;
    expect(downloaded.suggestedFilename()).toBe("fiche-paie-2026-06-01.pdf");
    const pdfPath = await downloaded.path();
    expect((await fs.readFile(pdfPath!)).subarray(0, 5).toString()).toBe("%PDF-");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("article", { name: "Fiche de paie 2026-06-01 - 2026-06-30" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historique publié" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger PDF" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer", exact: true })).not.toBeVisible();
    await page.emulateMedia({ media: "screen" });
    const ownPdf = await page.request.get(appUrl(`/api/employee/payslips/${replacement!.payslip_id}/pdf`));
    expect(ownPdf.headers()["cache-control"]).toContain("no-store");
    const foreignPdf = await page.request.get(appUrl(`/api/employee/payslips/${foreign!.payslip_id}/pdf`));
    expect(foreignPdf.status()).toBe(404);
    const foreignHistory = await page.request.get(appUrl(`/employee/payslips?payslip=${foreign!.payslip_id}`));
    expect(await foreignHistory.text()).not.toContain(recipients[1].name);
    expect((await page.request.post(appUrl("/api/exports"), { data: { exportType: "PUBLISHED_PAYSLIPS", format: "xlsx" } })).status()).toBe(403);

    await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.goBack();
    await page.reload();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect((await page.request.get(appUrl(`/api/employee/payslips/${replacement!.payslip_id}/pdf`))).status()).toBe(401);
    expect((await page.request.get(appUrl("/api/employee/payslips/export"))).status()).toBe(401);
  } finally {
    await cleanupRecipients(fixture, recipients);
    await fixture.cleanup();
  }
});

test("launch: preview and publication review include the last of 101 recipients", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createPayrollE2EFixture();
  const recipients = recipientRows(fixture, 101);
  try {
    await signInManager(page, fixture);
    const importId = await uploadWorkbook(page, testInfo, fixture, june, recipients);
    await expect(page.getByRole("table", { name: "Apercu des fiches de paie importees" }).getByText(recipients[100].name, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(page.getByRole("table", { name: "Apercu des fiches de paie importees" }).getByText(recipients[100].name, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirmer la publication", exact: true })).toBeDisabled();
    const review = page.getByRole("region", { name: "Destinataires de la publication" });
    await review.getByRole("button", { name: "Destinataires suivants", exact: true }).click();
    await review.getByRole("button", { name: "Destinataires suivants", exact: true }).click();
    await expect(review.getByText(recipients[100].email, { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Je confirme les destinataires et la publication de toutes les fiches valides." }).check();
    const publicationResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST",
    { timeout: 90_000 });
    await page.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await publicationResponse).status()).toBe(200);
    await expect.poll(async () => (await fixture.admin.from("payroll_imports").select("status").eq("id", importId).single()).data?.status, { timeout: 90_000 }).toBe("PUBLISHED");
    const { count, error } = await fixture.admin.from("payslip_versions").select("id", { count: "exact", head: true }).eq("import_id", importId);
    expect(error).toBeNull();
    expect(count).toBe(101);
    const notifications = await fixture.admin.from("notifications").select("status")
      .in("recipient_email", recipients.map((recipient) => recipient.email));
    expect(notifications.error).toBeNull();
    expect(notifications.data).toHaveLength(101);
    expect(notifications.data?.every((notification) => notification.status === "SENT")).toBe(true);
    await readInvitationEmail(page.request, recipients[100].email);
  } finally {
    await cleanupRecipients(fixture, recipients);
    await fixture.cleanup();
  }
});

test("launch: 2000 rows are imported completely and 2001 are rejected without sending mail", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createPayrollE2EFixture();
  try {
    await signInManager(page, fixture);
    const recipients = recipientRows(fixture, 2000);
    const importId = await uploadWorkbook(page, testInfo, fixture, june, recipients);
    const { count, error } = await fixture.admin.from("payroll_import_rows").select("id", { count: "exact", head: true }).eq("import_id", importId);
    expect(error).toBeNull();
    expect(count).toBe(2000);
    const { data: accepted, error: acceptedError } = await fixture.admin.from("payroll_imports")
      .select("status,valid_row_count").eq("id", importId).single();
    expect(acceptedError).toBeNull();
    expect(accepted).toEqual({ status: "READY_FOR_PREVIEW", valid_row_count: 2000 });
    const overflowId = await uploadWorkbook(page, testInfo, fixture, july, recipientRows(fixture, 2001));
    const { data: overflow } = await fixture.admin.from("payroll_imports").select("status,valid_row_count").eq("id", overflowId).single();
    expect(overflow).toEqual({ status: "FAILED", valid_row_count: 0 });
    const { count: invitations } = await fixture.admin.from("employee_invitations").select("id", { count: "exact", head: true }).eq("agency_id", fixture.agencyId);
    expect(invitations).toBe(0);
  } finally {
    await fixture.cleanup();
  }
});

test("launch: HR exports and access changes apply immediately to open manager and employee sessions", async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000);
  const fixture = await createPayrollE2EFixture();
  const other = await createPayrollE2EFixture();
  const hrContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const hrPage = await hrContext.newPage();
  const employeePage = await employeeContext.newPage();
  hrPage.setDefaultTimeout(15_000);
  employeePage.setDefaultTimeout(15_000);
  try {
    await signInManager(page, fixture);
    const importId = await uploadWorkbook(page, testInfo, fixture, june, recipientRows(fixture, 1));
    await publishViaReview(page, fixture, importId);
    const managerDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger XLSX", exact: true }).click();
    expect((await managerDownload).suggestedFilename()).toMatch(/\.xlsx$/);
    for (const format of ["csv", "xlsx"] as const) {
      const denied = await page.request.post(appUrl("/api/exports"), { data: { agencyId: other.agencyId, exportType: "IMPORT_REPORT", format } });
      expect(denied.status()).toBe(403);
    }
    await acceptEmployeeInvitationForE2E(fixture.admin, { agencyId: fixture.agencyId, employeeEmail: fixture.employeeEmail, fullName: "Recette 0001", password: fixture.password });
    await signInAsE2EUser(employeePage, { email: fixture.employeeEmail, password: fixture.password, targetPath: "/employee/payslips", expectedPath: /\/employee\/payslips$/ });
    const pdfUrl = await employeePage.getByRole("link", { name: "Télécharger PDF" }).getAttribute("href");
    expect(pdfUrl).toBeTruthy();
    await signInAsE2EUser(hrPage, { email: fixture.hr.email, password: fixture.password, targetPath: "/hr/exports", expectedPath: /\/hr\/exports$/ });
    await hrPage.getByRole("combobox", { name: "Agence", exact: true }).selectOption(fixture.agencyId);
    await hrPage.getByLabel("Début de période (inclus)").fill(june.periodStart);
    await hrPage.getByLabel("Fin de période (incluse)").fill(june.periodEnd);
    for (const format of ["csv", "xlsx", "pdf"] as const) {
      const pending = hrPage.waitForEvent("download");
      await hrPage.getByRole("button", { name: `Télécharger ${format.toUpperCase()}`, exact: true }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
      const bytes = await fs.readFile((await download.path())!);
      if (format === "csv") expect(bytes.toString()).toContain("Recette 0001");
      if (format === "pdf") {
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        await fs.writeFile(testInfo.outputPath("hr-payslips.pdf"), bytes);
        await testInfo.attach("hr-payslips.pdf", { body: bytes, contentType: "application/pdf" });
      }
      if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        expect(JSON.stringify(workbook.worksheets[0].getSheetValues())).toContain("Recette 0001");
      }
    }

    await hrPage.goto(appUrl(`/hr/users?agencyId=${fixture.agencyId}&q=Recette`));
    await expect.poll(() => hrPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const employeeAccess = hrPage.getByRole("form", { name: "Accès de Recette 0001", exact: true });
    await employeeAccess.getByRole("button", { name: "Désactiver l’accès", exact: true }).click();
    await expect(employeeAccess.getByRole("button", { name: "Réactiver l’accès", exact: true })).toBeVisible();
    expect((await employeePage.request.get(appUrl(pdfUrl!))).status()).toBe(403);
    await employeeAccess.getByRole("button", { name: "Réactiver l’accès", exact: true }).click();
    await expect(employeeAccess.getByRole("button", { name: "Désactiver l’accès", exact: true })).toBeVisible();
    expect((await employeePage.request.get(appUrl(pdfUrl!))).status()).toBe(200);

    const managerForm = hrPage.getByRole("form", { name: `Modifier le responsable ${fixture.manager.email}`, exact: true });
    await managerForm.getByLabel("Agence", { exact: true }).selectOption(other.agencyId);
    await managerForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(async () => (await fixture.admin.from("agency_memberships").select("agency_id").eq("profile_id", fixture.manager.id).single()).data?.agency_id).toBe(other.agencyId);
    const managerExportStatus = async (agencyId: string) => (await page.request.post(appUrl("/api/exports"), { data: { agencyId, exportType: "IMPORT_REPORT" } })).status();
    expect(await managerExportStatus(fixture.agencyId)).toBe(403);
    expect(await managerExportStatus(other.agencyId)).toBe(200);
    await managerForm.getByLabel("Accès actif", { exact: true }).uncheck();
    await managerForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(() => managerExportStatus(other.agencyId)).toBe(403);
    await managerForm.getByLabel("Accès actif", { exact: true }).check();
    await managerForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(() => managerExportStatus(other.agencyId)).toBe(200);

    await hrPage.goto(appUrl("/hr/agencies"));
    const agencyForm = hrPage.getByRole("form", { name: `Modifier l’agence Codex Audit ${other.suffix}`, exact: true });
    await agencyForm.getByLabel("Agence active", { exact: true }).uncheck();
    await agencyForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(() => managerExportStatus(other.agencyId)).toBe(403);
    await agencyForm.getByLabel("Agence active", { exact: true }).check();
    await agencyForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(() => managerExportStatus(other.agencyId)).toBe(200);
    const originalAgencyForm = hrPage.getByRole("form", { name: `Modifier l’agence Codex Audit ${fixture.suffix}`, exact: true });
    await originalAgencyForm.getByLabel("Agence active", { exact: true }).uncheck();
    await originalAgencyForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(async () => (await employeePage.request.get(appUrl(pdfUrl!))).status()).toBe(403);
    await originalAgencyForm.getByLabel("Agence active", { exact: true }).check();
    await originalAgencyForm.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(async () => (await employeePage.request.get(appUrl(pdfUrl!))).status()).toBe(200);
  } catch (error) {
    await hrPage.screenshot({ path: testInfo.outputPath("hr-failure.png"), fullPage: true }).catch(() => {});
    const geometry = await hrPage.getByRole("form", { name: "Accès de Recette 0001", exact: true }).evaluate((form) => {
      const button = form.querySelector("button");
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const detail = (node: Element | null) => node ? ({ tag: node.tagName, text: node.textContent, rect: node.getBoundingClientRect().toJSON(), display: getComputedStyle(node).display, minWidth: getComputedStyle(node).minWidth, width: getComputedStyle(node).width, overflow: getComputedStyle(node).overflow, flex: getComputedStyle(node).flex, position: getComputedStyle(node).position }) : null;
      return { viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, visual: visualViewport?.width }, overflowing: [...document.querySelectorAll("input,select,fieldset,form,article")].filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth).slice(0, 18).map(detail), button: detail(button), form: detail(form), card: detail(form.parentElement), info: detail(form.previousElementSibling), hit: detail(hit) };
    }).catch(() => null);
    await fs.writeFile(testInfo.outputPath("hr-failure-geometry.json"), JSON.stringify(geometry, null, 2));
    await testInfo.attach("HR page at failure", { body: await hrPage.locator("body").ariaSnapshot().catch(() => "Page unavailable"), contentType: "text/plain" });
    await testInfo.attach("Employee page at failure", { body: await employeePage.locator("body").ariaSnapshot().catch(() => "Page unavailable"), contentType: "text/plain" });
    throw error;
  } finally {
    await hrContext.close();
    await employeeContext.close();
    // Delete the reassigned manager before deleting its new agency.
    await fixture.cleanup();
    await other.cleanup();
  }
});

type Recipient = { employeeId: string; email: string; name: string };
function recipientRows(fixture: PayrollE2EFixture, count: number): Recipient[] {
  return Array.from({ length: count }, (_, index) => ({
    employeeId: `READY-${String(index + 1).padStart(4, "0")}`,
    email: index === 0 ? fixture.employeeEmail : `launch-${fixture.suffix}-${index + 1}@example.com`,
    name: `Recette ${String(index + 1).padStart(4, "0")}`,
  }));
}

async function signInManager(page: Page, fixture: PayrollE2EFixture) {
  await signInAsE2EUser(page, { email: fixture.manager.email, password: fixture.password, expectedPath: /\/manager\/imports$/, targetPath: "/manager/imports" });
}

async function uploadWorkbook(page: Page, testInfo: TestInfo, fixture: PayrollE2EFixture, period: Period, recipients: Recipient[], net = 1_250_000) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("payroll");
  sheet.addRow(["employee_id", "email", "period_start", "period_end", "employee_name", "gross_amount", "deductions_total", "net_amount"]);
  for (const recipient of recipients) sheet.addRow([recipient.employeeId, recipient.email, period.periodStart, period.periodEnd, recipient.name, 1_500_000, 1_500_000 - net, net]);
  const filename = testInfo.outputPath(`launch-${fixture.suffix}-${period.periodStart}-${recipients.length}-${net}.xlsx`);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await workbook.xlsx.writeFile(filename);
  await page.goto(appUrl("/manager/imports"));
  await page.getByLabel("Debut de periode").fill(period.periodStart);
  await page.getByLabel("Fin de periode").fill(period.periodEnd);
  await page.getByLabel("Fichier Excel").setInputFiles(filename);
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith("/api/imports") && response.request().method() === "POST", { timeout: 45_000 });
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  expect((await uploadResponse).status()).toBe(200);
  await page.waitForURL(/\/manager\/imports\/[0-9a-f-]+$/, { timeout: 45_000 });
  return page.url().split("/").at(-1)!;
}

async function publishViaReview(page: Page, fixture: PayrollE2EFixture, importId: string) {
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Vérifier avant publication" });
  await expect(review.getByText(fixture.employeeEmail, { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Confirmer la publication", exact: true })).toBeDisabled();
  await review.getByRole("checkbox", { name: "Je confirme les destinataires et la publication de toutes les fiches valides." }).check();
  const publicationResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST",
  );
  await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
  expect((await publicationResponse).status()).toBe(200);
  await expect.poll(async () => (await fixture.admin.from("payroll_imports").select("status").eq("id", importId).single()).data?.status).toBe("PUBLISHED");
  await expect(page.getByRole("button", { name: "Publier", exact: true })).toHaveCount(0);
}

type AdjustedRow = { id: string; updated_at: string; normalized_data: { netAmount: number }; has_manual_adjustments: boolean };
async function importRow(fixture: PayrollE2EFixture, importId: string, employeeId: string): Promise<AdjustedRow> {
  let row: AdjustedRow | null = null;
  await expect.poll(async () => {
    const result = await fixture.admin.from("payroll_import_rows").select("id,updated_at,normalized_data,has_manual_adjustments").eq("import_id", importId).eq("employee_id", employeeId).single();
    expect(result.error).toBeNull();
    row = result.data;
    return row?.has_manual_adjustments;
  }).toBe(true);
  return row!;
}

async function cleanupRecipients(fixture: PayrollE2EFixture, recipients: Recipient[]) {
  const { error } = await fixture.admin.from("notifications").delete().in("recipient_email", recipients.map((recipient) => recipient.email));
  if (error) throw new Error(`Unable to clean launch notifications: ${error.message}`);
}
