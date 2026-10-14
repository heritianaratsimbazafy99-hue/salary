import { expect, test } from "@playwright/test";

import { appUrl, createHrE2EFixture, createHrScopedUser, hrRpc, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("HR completes a file; employee, manager and client each see only what their role allows", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createHrE2EFixture();
  const matricule = `E2E-${fixture.suffix.slice(-6).toUpperCase()}`;
  const employeeEmail = `codex-employee-${fixture.suffix}@example.com`;
  fixture.createdEmails.push(employeeEmail);

  try {
    const hr = fixture.hr.id;
    const siteA = await hrRpc<string>(fixture, "hr_save_site", { p_actor_id: hr, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Site Nord", p_code: "NORD", p_active: true, p_revision: null });
    const siteB = await hrRpc<string>(fixture, "hr_save_site", { p_actor_id: hr, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Site Sud", p_code: "SUD", p_active: true, p_revision: null });
    const department = await hrRpc<string>(fixture, "hr_save_department", { p_actor_id: hr, p_department_id: null, p_agency_id: fixture.agencyId, p_name: "Relation client", p_active: true, p_revision: null });
    await hrRpc(fixture, "hr_save_team", { p_actor_id: hr, p_team_id: null, p_site_id: siteA, p_name: "Équipe jour", p_active: true, p_revision: null });
    const manager = await createHrScopedUser(fixture, "team_manager", "manager", { department_id: department, site_id: siteA });
    const client = await createHrScopedUser(fixture, "client_viewer", "client", { site_id: siteB });

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/employees?agencyId=${fixture.agencyId}`, expectedPath: /\/hr\/employees/ });
    await page.getByText(/Créer un dossier dans/).click();
    const form = page.getByRole("form", { name: "Nouveau collaborateur" });
    await form.getByLabel("Matricule paie").fill(matricule);
    await form.getByLabel("Nom complet").fill("Hery Rakoto");
    await form.getByLabel("Email de connexion").fill(employeeEmail);
    await form.getByLabel("Poste").fill("Conseiller client");
    await form.getByLabel("Département").selectOption({ label: "Relation client" });
    await form.getByLabel("Site", { exact: true }).selectOption({ label: "Site Nord (NORD)" });
    await form.getByLabel("Équipe (facultatif)").selectOption({ label: "Équipe jour — Site Nord" });
    await form.getByLabel("Responsable (facultatif)").selectOption({ label: "Codex manager" });
    await form.getByLabel("Début du contrat").fill("2026-01-05");
    await form.getByRole("button", { name: "Créer le dossier" }).click();
    await expect(form.getByText(/Dossier créé/)).toBeVisible();

    await page.goto(appUrl(`/hr/employees?agencyId=${fixture.agencyId}&q=${matricule}`));
    await page.getByRole("link", { name: "Hery Rakoto" }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: "Hery Rakoto", level: 1 })).toBeVisible();
    const privateForm = page.getByRole("form", { name: "Coordonnées privées" });
    await privateForm.getByLabel("Téléphone").fill("+261 34 11 222 33");
    await privateForm.getByRole("button", { name: "Enregistrer" }).click();
    await expect(privateForm.getByText("Coordonnées enregistrées.")).toBeVisible();

    await page.reload();
    const cnapsForm = page.getByRole("form", { name: "Suivi CNAPS" });
    await cnapsForm.getByLabel("Statut du dossier").selectOption("DECLARED");
    await cnapsForm.getByRole("button", { name: "Enregistrer" }).click();
    await expect(cnapsForm.getByText(/numéro CNAPS est obligatoire/)).toBeVisible();
    await cnapsForm.getByLabel("Numéro CNAPS").fill("CN-778899");
    await cnapsForm.getByRole("button", { name: "Enregistrer" }).click();
    await expect(cnapsForm.getByText("Suivi CNAPS enregistré.")).toBeVisible();

    // The employee's login is linked to the same employees row as payroll.
    const { data: employeeUser } = await fixture.admin.auth.admin.createUser({ email: employeeEmail, password: fixture.password, email_confirm: true });
    const { data: profile } = await fixture.admin.from("profiles").insert({ auth_user_id: employeeUser.user!.id, email: employeeEmail, full_name: "Hery Rakoto", role: "employee" }).select("id").single();
    await fixture.admin.from("employees").update({ profile_id: profile!.id }).eq("agency_id", fixture.agencyId).eq("employee_id", matricule);

    await signInAsE2EUser(page, { email: employeeEmail, password: fixture.password, targetPath: "/employee/profile", expectedPath: /\/employee\/profile$/ });
    await expect(page.getByRole("heading", { name: "Conseiller client" })).toBeVisible();
    await expect(page.getByText("+261 34 11 222 33")).toBeVisible();
    await expect(page.getByText("CN-778899")).toBeVisible();
    await expect(page.getByText("Codex manager")).toBeVisible();

    await signInAsE2EUser(page, { email: manager.email, password: fixture.password, targetPath: "/team", expectedPath: /\/team$/ });
    await expect(page.getByText("Hery Rakoto").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Conseiller client").filter({ visible: true })).toBeVisible();
    for (const secret of ["+261 34 11 222 33", "CN-778899", employeeEmail]) await expect(page.getByText(secret)).toHaveCount(0);
    const employeeId = (await fixture.admin.from("employees").select("id").eq("employee_id", matricule).single()).data!.id;
    await page.goto(appUrl(`/hr/employees/${employeeId}`));
    await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();

    await signInAsE2EUser(page, { email: client.email, password: fixture.password, targetPath: "/client", expectedPath: /\/client$/ });
    await expect(page.getByText("Aucun collaborateur correspondant.")).toBeVisible();
    await expect(page.getByText("Hery Rakoto")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
