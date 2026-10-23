import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { appUrl } from "./helpers/supabase-fixtures";
import { agencyRpc, createAgencyEmployeeFixture, employeeRow, seedMinimalEmployee } from "./helpers/agency-employees";

test("XLSX employee imports block the whole selection, exclude conflicts and replay without duplication", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const fixture = await createAgencyEmployeeFixture();
  const other = await createAgencyEmployeeFixture();
  try {
    const suffix = fixture.suffix.slice(-6).toUpperCase();
    const existing = `SAME-${suffix}`;
    const conflict = `DIFF-${suffix}`;
    const fresh = `NEW-${suffix}`;
    const archived = `ARCH-${suffix}`;
    const archivedEmail = `archived-${fixture.suffix}@example.com`;
    const sameEmail = `same-${fixture.suffix}@example.com`;
    const conflictEmail = `conflict-${fixture.suffix}@example.com`;
    const freshEmail = `new-${fixture.suffix}@example.com`;
    await seedMinimalEmployee(fixture, existing, "Salarié identique", sameEmail);
    await seedMinimalEmployee(fixture, conflict, "Nom officiel conservé", conflictEmail);
    const archivedId = await seedMinimalEmployee(fixture, archived, "Salarié archivé", archivedEmail);
    await agencyRpc(fixture, "agency_depart_employee", { p_actor_id: fixture.manager.id, p_employee_id: archivedId, p_revision: 1, p_lifecycle_revision: 1, p_departed_on: "2026-01-05", p_reason: "CONTRACT_END" });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("salaries");
    sheet.addRow(["matricule", "nom_complet", "email"]);
    sheet.addRow([fresh, "Salarié nouveau", freshEmail]);
    sheet.addRow([existing, "Salarié identique", sameEmail]);
    sheet.addRow([conflict, "Nom divergent du fichier", conflictEmail]);
    sheet.addRow([archived, "Salarié archivé", archivedEmail]);
    const filePath = testInfo.outputPath(path.join("fixtures", "agency-employees.xlsx"));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await workbook.xlsx.writeFile(filePath);

    await fixture.managerLogin(page);
    await page.goto(appUrl("/manager/employees/imports"));
    await page.getByLabel("Fichier salariés XLSX").setInputFiles(filePath);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ), { message: "The upload form must fit the viewport after selecting a workbook" }).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Prévisualiser le fichier" }).click();
    await expect(page).toHaveURL(/\/manager\/employees\/imports\/[0-9a-f-]+$/);
    const importId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByText("À créer", { exact: true })).toBeVisible();
    await expect(page.getByText("Identique — ignoré", { exact: true })).toBeVisible();
    await expect(page.getByText("Conflit", { exact: true })).toBeVisible();
    await expect(page.getByText("Archivé", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ), { message: "The review table must scroll inside its panel without widening the document" }).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("employee-import-review.png"), fullPage: true });
    const report = await fixture.admin.from("employee_imports").select("fingerprint,status").eq("id", importId).single();
    expect(report.error).toBeNull();
    expect(report.data!.status).toBe("INVALID");
    // A direct authenticated submission must enforce the same all-or-nothing rule as the UI.
    const blocked = await page.request.post(appUrl(`/api/manager/employee-imports/${importId}`), { headers: { origin: new URL(appUrl("/")).origin }, data: { intent: "commit", fingerprint: report.data!.fingerprint } });
    expect(blocked.status()).toBe(422);
    expect((await fixture.admin.from("employees").select("id").eq("agency_id", fixture.agencyId).eq("employee_id", fresh)).data).toEqual([]);

    await page.getByLabel("Exclure la ligne 4").check();
    await page.getByLabel("Exclure la ligne 5").check();
    await page.getByRole("button", { name: "Revoir la sélection" }).click();
    await expect(page.getByText("Exclu", { exact: true })).toHaveCount(2);
    await page.getByLabel("Je confirme les créations retenues").check();
    await page.getByRole("button", { name: "Confirmer les créations" }).click();
    await expect.poll(async () => (await fixture.admin.from("employee_imports").select("status").eq("id", importId).single()).data?.status).toBe("COMMITTED");
    const created = await employeeRow(fixture, fresh);
    expect(created.full_name).toBe("Salarié nouveau");
    expect(created.profile_id).toBeNull();
    expect((await employeeRow(fixture, conflict)).full_name).toBe("Nom officiel conservé");
    expect((await fixture.admin.from("employee_invitations").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    const committed = await fixture.admin.from("employee_imports").select("fingerprint,created_count").eq("id", importId).single();
    expect(committed.data!.created_count).toBe(1);
    const replay = await page.request.post(appUrl(`/api/manager/employee-imports/${importId}`), { headers: { origin: new URL(appUrl("/")).origin }, data: { intent: "commit", fingerprint: committed.data!.fingerprint } });
    expect(replay.ok()).toBe(true);
    expect((await fixture.admin.from("employees").select("id").eq("agency_id", fixture.agencyId)).data).toHaveLength(4);
    expect((await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", archivedId).single()).data?.state).toBe("DEPARTED");
    expect((await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", (await employeeRow(fixture, conflict)).id).single()).data?.state).toBe("CURRENT");
    const events = await fixture.admin.from("agency_employee_events").select("actor_profile_id,action,result").eq("employee_id", created.id);
    expect(events.error).toBeNull();
    expect(events.data).toEqual(expect.arrayContaining([expect.objectContaining({ actor_profile_id: fixture.manager.id, result: "SUCCESS" })]));

    await other.managerLogin(page);
    const forbidden = await page.request.get(appUrl(`/api/manager/employee-imports/${importId}`));
    expect([403, 404]).toContain(forbidden.status());
    await page.goto(appUrl(`/manager/employees/imports/${importId}`));
    await expect(page.locator("body")).not.toContainText(freshEmail);
  } finally {
    await other.cleanup();
    await fixture.cleanup();
  }
});
