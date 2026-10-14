import { expect, test } from "@playwright/test";
import { appUrl, createPayrollE2EFixture, createPayrollWorkbook, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("RH lowercase matricule publishes through the real XLSX parser on the same linked dossier", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const fixture = await createPayrollE2EFixture();
  const matricule = `emp-${fixture.suffix.slice(-6)}`;
  try {
    const site = await fixture.admin.rpc("hr_save_site", { p_actor_id: fixture.hr.id, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Identity Site", p_code: "IDENTITY", p_active: true, p_revision: null });
    const department = await fixture.admin.rpc("hr_save_department", { p_actor_id: fixture.hr.id, p_department_id: null, p_agency_id: fixture.agencyId, p_name: "Identity Department", p_active: true, p_revision: null });
    expect(site.error).toBeNull(); expect(department.error).toBeNull();
    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/employees?agencyId=${fixture.agencyId}`, expectedPath: /\/hr\/employees/ });
    await page.getByText(/Créer un dossier dans/).click();
    const form = page.getByRole("form", { name: "Nouveau collaborateur" });
    await form.getByLabel("Matricule paie").fill(` ${matricule} `);
    await form.getByLabel("Nom complet").fill("Rina Salary");
    await form.getByLabel("Email de connexion").fill(fixture.employeeEmail);
    await form.getByLabel("Poste").fill("Conseiller identité");
    await form.getByLabel("Département").selectOption(department.data);
    await form.getByLabel("Site", { exact: true }).selectOption(site.data);
    await form.getByLabel("Début du contrat").fill("2026-01-05");
    await form.getByRole("button", { name: "Créer le dossier" }).click();
    await expect(form.getByText(/Dossier créé/)).toBeVisible();
    const employee = await fixture.admin.from("employees").select("id,employee_id").eq("agency_id", fixture.agencyId).single();
    expect(employee.error).toBeNull();
    expect(employee.data!.employee_id).toBe(matricule.toUpperCase());
    const employeeUuid = employee.data!.id;
    const auth = await fixture.admin.auth.admin.createUser({ email: fixture.employeeEmail, password: fixture.password, email_confirm: true });
    expect(auth.error).toBeNull();
    const profile = await fixture.admin.from("profiles").insert({ auth_user_id: auth.data.user!.id, email: fixture.employeeEmail, full_name: "Rina Salary", role: "employee" }).select("id").single();
    expect(profile.error).toBeNull();
    expect((await fixture.admin.from("employees").update({ profile_id: profile.data!.id }).eq("id", employeeUuid)).error).toBeNull();
    const privateDetails = await fixture.admin.rpc("hr_save_private_details", { p_actor_id: fixture.hr.id, p_employee_id: employeeUuid, p_personal_email: null, p_personal_phone: "+261 34 55 123 45", p_postal_address: null, p_emergency_contact: null, p_revision: 1 });
    expect(privateDetails.error).toBeNull();

    const workbookPath = await createPayrollWorkbook(testInfo, { employeeEmail: fixture.employeeEmail, periodEnd: fixture.periodEnd, periodStart: fixture.periodStart, suffix: fixture.suffix });
    await signInAsE2EUser(page, { email: fixture.manager.email, password: fixture.password, targetPath: "/manager/imports", expectedPath: /\/manager\/imports$/ });
    await page.getByLabel("Debut de periode").fill(fixture.periodStart);
    await page.getByLabel("Fin de periode").fill(fixture.periodEnd);
    await page.getByLabel("Fichier Excel").setInputFiles(workbookPath);
    await page.getByRole("button", { name: "Importer" }).click();
    await page.waitForURL(/\/manager\/imports\/[0-9a-f-]+$/);
    const importId = page.url().split("/").at(-1)!;
    await expect(page.getByLabel("100 % des lignes sont valides.")).toBeVisible();
    const imported = await fixture.admin.from("payroll_imports").select("valid_row_count,invalid_row_count,unknown_employee_count").eq("id", importId).single();
    expect(imported.data).toEqual({ valid_row_count: 1, invalid_row_count: 0, unknown_employee_count: 0 });
    await page.getByLabel("Categorie").selectOption("BENEFIT");
    await page.getByRole("button", { name: "Enregistrer les mappings" }).click();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Vérifier avant publication" });
    await expect(review.getByText(fixture.employeeEmail, { exact: true })).toBeVisible();
    await review.getByRole("checkbox").check();
    const published = page.waitForResponse((response) => response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await published).status()).toBe(200);
    expect((await fixture.admin.from("employees").select("id,profile_id").eq("agency_id", fixture.agencyId)).data).toEqual([{ id: employeeUuid, profile_id: profile.data!.id }]);
    expect((await fixture.admin.from("payslips").select("employee_id").eq("agency_id", fixture.agencyId)).data).toEqual([{ employee_id: employeeUuid }]);
    expect((await fixture.admin.from("employee_invitations").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    expect((await fixture.admin.from("employee_hr_records").select("job_title").eq("employee_id", employeeUuid).single()).data?.job_title).toBe("Conseiller identité");
    await signInAsE2EUser(page, { email: fixture.employeeEmail, password: fixture.password, targetPath: "/employee/profile", expectedPath: /\/employee\/profile$/ });
    await expect(page.getByText("+261 34 55 123 45")).toBeVisible();
    await page.goto(appUrl("/employee/payslips"));
    await expect(page.getByText("Rina Salary")).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
