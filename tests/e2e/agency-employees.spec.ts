import { expect, test } from "@playwright/test";
import { appUrl, signInAsE2EUser } from "./helpers/supabase-fixtures";
import { agencyRpc, createAgencyEmployeeFixture, employeeRow, seedMinimalEmployee } from "./helpers/agency-employees";

test("two agency managers share a minimal employee, edit operations and cannot open private HR or another agency", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createAgencyEmployeeFixture();
  const other = await createAgencyEmployeeFixture();
  try {
    const second = await fixture.addManager();
    const matricule = `MIN-${fixture.suffix.slice(-6).toUpperCase()}`;
    const site = await agencyRpc<string>(fixture, "hr_save_site", { p_actor_id: fixture.hr.id, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Site agence E2E", p_code: "AGENCE", p_active: true, p_revision: null });
    const department = await agencyRpc<string>(fixture, "hr_save_department", { p_actor_id: fixture.hr.id, p_department_id: null, p_agency_id: fixture.agencyId, p_name: "Service agence E2E", p_active: true, p_revision: null });
    const team = await agencyRpc<string>(fixture, "hr_save_team", { p_actor_id: fixture.hr.id, p_team_id: null, p_site_id: site, p_name: "Équipe agence E2E", p_active: true, p_revision: null });
    await fixture.managerLogin(page);
    await page.getByRole("link", { name: "Nouveau salarié" }).click();
    const create = page.getByRole("form", { name: "Créer un salarié" });
    await create.getByLabel("Matricule", { exact: true }).fill(matricule);
    await create.getByLabel("Nom complet").fill("Identité initiale E2E");
    await create.getByLabel("Email de connexion").fill(fixture.employeeEmail);
    await create.getByRole("button", { name: "Créer le salarié" }).click();
    await expect(page).toHaveURL(/\/manager\/employees\/[0-9a-f-]+$/);
    const employee = await employeeRow(fixture, matricule);
    expect(employee.profile_id).toBeNull();
    expect((await fixture.admin.from("employee_hr_records").select("employee_id").eq("employee_id", employee.id)).data).toEqual([]);
    expect((await fixture.admin.from("employee_invitations").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    await expect(page.getByText(/Dossier RH à compléter/)).toBeVisible();
    await expect(page.getByRole("form", { name: "Coordonnées privées" })).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Suivi CNAPS" })).toHaveCount(0);
    const edit = page.getByRole("form", { name: "Modifier le salarié" });
    await edit.getByLabel("Nom complet").fill("Identité officielle E2E");
    await edit.getByLabel("Poste", { exact: true }).fill("Conseiller agence");
    await edit.getByLabel("Département", { exact: true }).selectOption(department);
    await edit.getByLabel("Site", { exact: true }).selectOption(site);
    await edit.getByLabel("Équipe", { exact: true }).selectOption(team);
    await edit.getByLabel("Motif de la modification").fill("Complétion opérationnelle sans contrat");
    await edit.getByRole("button", { name: "Enregistrer le dossier" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Dossier enregistré." })).toBeVisible();
    expect((await employeeRow(fixture, matricule)).full_name).toBe("Identité officielle E2E");
    const operations = await fixture.admin.from("employee_agency_operations").select("job_title,department_id,site_id,team_id").eq("employee_id", employee.id).single();
    expect(operations.error).toBeNull();
    expect(operations.data).toEqual({ job_title: "Conseiller agence", department_id: department, site_id: site, team_id: team });
    expect((await fixture.admin.from("employee_hr_records").select("employee_id").eq("employee_id", employee.id)).data).toEqual([]);

    await fixture.managerLogin(page, second.email);
    await page.locator(`a[href="/manager/employees/${employee.id}"]`).filter({ visible: true }).click({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Identité officielle E2E", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Poste", { exact: true })).toHaveValue("Conseiller agence");
    await page.goto(appUrl(`/hr/employees/${employee.id}`));
    await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();
    await other.managerLogin(page);
    await expect(page.locator(`a[href="/manager/employees/${employee.id}"]`)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Identité officielle E2E");
    await page.goto(appUrl(`/manager/employees/${employee.id}`));
    await expect(page.locator("body")).not.toContainText(fixture.employeeEmail);
    const audit = await fixture.admin.from("agency_employee_events").select("actor_profile_id,action,result").eq("employee_id", employee.id);
    expect(audit.error).toBeNull();
    expect(audit.data!.filter((event) => event.actor_profile_id === fixture.manager.id && event.result === "SUCCESS").length).toBeGreaterThanOrEqual(2);
  } finally {
    await other.cleanup();
    await fixture.cleanup();
  }
});

test("departure rejects future dates, archives today and past, preserves login and requires HR for return", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createAgencyEmployeeFixture();
  try {
    const matricule = `LIFE-${fixture.suffix.slice(-6).toUpperCase()}`;
    const employeeId = await seedMinimalEmployee(fixture, matricule, "Salarié cycle E2E", fixture.employeeEmail);
    const auth = await fixture.admin.auth.admin.createUser({ email: fixture.employeeEmail, password: fixture.password, email_confirm: true });
    expect(auth.error).toBeNull();
    const profile = await fixture.admin.from("profiles").insert({ auth_user_id: auth.data.user!.id, email: fixture.employeeEmail, full_name: "Salarié cycle E2E", role: "employee" }).select("id").single();
    expect(profile.error).toBeNull();
    expect((await fixture.admin.from("employees").update({ profile_id: profile.data!.id }).eq("id", employeeId)).error).toBeNull();
    await fixture.managerLogin(page);
    await page.goto(appUrl(`/manager/employees/${employeeId}`));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const future = tomorrow.toISOString().slice(0, 10);
    const departure = page.getByRole("form", { name: "Enregistrer un départ" });
    await departure.getByLabel("Date effective de départ").fill(future);
    await departure.getByLabel("Motif du départ").selectOption("CONTRACT_END");
    await departure.getByLabel("Je confirme ce départ").check();
    // Remove only the native max to exercise the server's date validation too.
    await departure.getByLabel("Date effective de départ").evaluate((input) => input.removeAttribute("max"));
    await departure.getByRole("button", { name: "Confirmer le départ" }).click();
    await expect(departure.getByText(/jour ou du passé/)).toBeVisible();
    expect((await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", employeeId).single()).data?.state).toBe("CURRENT");
    await departure.getByLabel("Date effective de départ").fill(today);
    await departure.getByRole("button", { name: "Confirmer le départ" }).click();
    await expect.poll(async () => (await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", employeeId).single()).data?.state).toBe("DEPARTED");
    expect((await employeeRow(fixture, matricule)).is_active).toBe(true);
    await page.goto(appUrl("/manager/employees"));
    await expect(page.locator(`a[href="/manager/employees/${employeeId}"]`)).toHaveCount(0);
    await page.getByLabel("Effectif").selectOption("DEPARTED");
    await page.getByRole("button", { name: "Rechercher", exact: true }).click();
    await page.locator(`a[href="/manager/employees/${employeeId}"]`).filter({ visible: true }).click({ timeout: 15_000 });
    await page.getByText("Retour dans l’effectif", { exact: true }).click();
    const request = page.getByRole("form", { name: "Demander : Retour dans l’effectif" });
    await request.getByLabel("Date de retour souhaitée").fill(today);
    await request.getByLabel("Motif de la demande").fill("Nouvelle mission validée par les RH");
    await request.getByRole("button", { name: "Transmettre aux RH" }).click();
    await expect(request.getByText(/Demande transmise aux RH/)).toBeVisible();
    const pending = await fixture.admin.from("agency_employee_change_requests").select("id,status").eq("employee_id", employeeId).eq("kind", "RETURN").single();
    expect(pending.error).toBeNull();
    expect(pending.data!.status).toBe("PENDING");
    expect((await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", employeeId).single()).data?.state).toBe("DEPARTED");
    await signInAsE2EUser(page, { email: fixture.employeeEmail, password: fixture.password, targetPath: "/employee/payslips", expectedPath: /\/employee\/payslips/ });
    await expect(page.getByRole("heading", { name: /fiches/i, level: 1 })).toBeVisible();

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: "/hr/agency-requests", expectedPath: /\/hr\/agency-requests/ });
    const decision = page.getByRole("form", { name: `Décider la demande ${pending.data!.id}` });
    await decision.getByLabel("Décision", { exact: true }).selectOption("APPROVE");
    await decision.getByLabel("Motif de la décision").fill("Retour confirmé sans changement d’accès");
    await decision.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect.poll(async () => (await fixture.admin.from("agency_employee_change_requests").select("status").eq("id", pending.data!.id).single()).data?.status).toBe("EXECUTED");
    const returned = await fixture.admin.from("employee_employment_lifecycle").select("employee_id,state").eq("employee_id", employeeId).single();
    expect(returned.data).toEqual({ employee_id: employeeId, state: "CURRENT" });
    expect((await employeeRow(fixture, matricule)).profile_id).toBe(profile.data!.id);
    const episodes = await fixture.admin.from("employee_employment_episodes").select("state").eq("employee_id", employeeId).order("lifecycle_revision");
    expect(episodes.data?.map((episode) => episode.state)).toEqual(["CURRENT", "DEPARTED", "CURRENT"]);

    const pastId = await seedMinimalEmployee(fixture, `PAST-${fixture.suffix.slice(-6).toUpperCase()}`, "Départ passé", `past-${fixture.suffix}@example.com`);
    await fixture.managerLogin(page);
    await page.goto(appUrl(`/manager/employees/${pastId}`));
    const pastDeparture = page.getByRole("form", { name: "Enregistrer un départ" });
    await pastDeparture.getByLabel("Date effective de départ").fill("2026-01-05");
    await pastDeparture.getByLabel("Motif du départ").selectOption("OTHER");
    await pastDeparture.getByLabel("Je confirme ce départ").check();
    await pastDeparture.getByRole("button", { name: "Confirmer le départ" }).click();
    await expect.poll(async () => (await fixture.admin.from("employee_employment_lifecycle").select("departed_on").eq("employee_id", pastId).single()).data?.departed_on).toBe("2026-01-05");
  } finally {
    await fixture.cleanup();
  }
});
