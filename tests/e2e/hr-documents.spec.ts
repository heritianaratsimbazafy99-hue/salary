import { expect, test, type Page } from "@playwright/test";

import { appUrl, createHrE2EFixture, createHrEmployeeLogin, createHrOrganisation, createHrScopedUser, signInAsE2EUser } from "./helpers/supabase-fixtures";

async function downloadStatus(page: Page, documentId: string) {
  const response = await page.request.get(appUrl(`/api/hr/documents/${documentId}/download`), { maxRedirects: 0 });
  return response.status();
}

test("HR deposits a verified private document that only its employee can download until withdrawn", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createHrE2EFixture();
  try {
    const { siteId, departmentId } = await createHrOrganisation(fixture, "Docs");
    const owner = await createHrEmployeeLogin(fixture, "owner", { siteId, departmentId });
    const other = await createHrEmployeeLogin(fixture, "other", { siteId, departmentId });
    const { email: managerEmail } = await createHrScopedUser(fixture, "team_manager", "docmanager", { department_id: departmentId });

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/employees/${owner.employeeId}`, expectedPath: /\/hr\/employees\// });
    const upload = page.getByRole("form", { name: "Déposer un document" });
    // A text file renamed .pdf is refused after the server reads the stored bytes.
    await upload.getByLabel("Titre").fill("Faux contrat");
    await upload.getByLabel("Date du document").fill("2026-01-05");
    await upload.getByLabel(/Fichier/).setInputFiles({ name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>pas un pdf</html>") });
    await upload.getByRole("button", { name: "Déposer" }).click();
    await expect(upload.getByRole("alert")).toContainText("Fichier refusé");

    await upload.getByLabel("Titre").fill("Contrat signé Airtel");
    await upload.getByLabel(/Fichier/).setInputFiles({ name: "contrat.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% contrat E2E\n%%EOF\n") });
    await upload.getByRole("button", { name: "Déposer" }).click();
    await expect(upload.getByRole("status")).toContainText("Document déposé");
    await expect(page.getByText("Contrat signé Airtel", { exact: true })).toBeVisible();
    const { data: documents } = await fixture.admin.from("employee_documents").select("id,status,title").eq("employee_id", owner.employeeId);
    expect(documents?.map((d) => `${d.title}:${d.status}`).sort()).toEqual(["Contrat signé Airtel:AVAILABLE", "Faux contrat:REJECTED"]);
    const documentId = documents!.find((d) => d.status === "AVAILABLE")!.id;

    await page.context().clearCookies();
    expect(await downloadStatus(page, documentId)).toBe(401);

    await signInAsE2EUser(page, { email: owner.email, password: fixture.password, targetPath: "/employee/profile", expectedPath: /\/employee\/profile$/ });
    await expect(page.getByText("Contrat signé Airtel", { exact: true })).toBeVisible();
    const redirect = await page.request.get(appUrl(`/api/hr/documents/${documentId}/download`), { maxRedirects: 0 });
    expect(redirect.status()).toBe(303);
    expect(redirect.headers()["cache-control"]).toContain("no-store");
    const file = await page.request.get(redirect.headers().location!);
    expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await signInAsE2EUser(page, { email: other.email, password: fixture.password, targetPath: "/employee/profile", expectedPath: /\/employee\/profile$/ });
    await expect(page.getByText("Contrat signé Airtel")).toHaveCount(0);
    expect(await downloadStatus(page, documentId)).toBe(404);

    await signInAsE2EUser(page, { email: managerEmail, password: fixture.password, targetPath: "/team", expectedPath: /\/team$/ });
    expect(await downloadStatus(page, documentId)).toBe(404);

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/employees/${owner.employeeId}`, expectedPath: /\/hr\/employees\// });
    await page.getByText("Retirer", { exact: true }).click();
    const withdraw = page.getByRole("form", { name: "Retirer Contrat signé Airtel" });
    await withdraw.getByLabel("Motif du retrait").fill("Déposé par erreur");
    await withdraw.getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(page.getByText("Retiré", { exact: true })).toBeVisible();

    await signInAsE2EUser(page, { email: owner.email, password: fixture.password, targetPath: "/employee/profile", expectedPath: /\/employee\/profile$/ });
    await expect(page.getByText("Contrat signé Airtel")).toHaveCount(0);
    expect(await downloadStatus(page, documentId)).toBe(404);
  } finally {
    const { data: stored } = await fixture.admin.from("employee_documents").select("storage_path").eq("agency_id", fixture.agencyId);
    if (stored?.length) await fixture.admin.storage.from("hr-documents").remove(stored.map((row) => row.storage_path));
    await fixture.cleanup();
  }
});
