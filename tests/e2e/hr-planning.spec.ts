import { expect, test } from "@playwright/test";

import { createHrE2EFixture, createHrEmployeeLogin, createHrOrganisation, createHrScopedUser, hrRpc, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("manager approves with a replacement need, assigns and confirms a replacement; the client sees it without reasons", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createHrE2EFixture();
  try {
    const { siteId, departmentId } = await createHrOrganisation(fixture, "Plan");
    await hrRpc(fixture, "hr_save_team", { p_actor_id: fixture.hr.id, p_team_id: null, p_site_id: siteId, p_name: "Équipe soir", p_active: true, p_revision: null });
    const absent = await createHrEmployeeLogin(fixture, "absent", { siteId, departmentId });
    const backup = await createHrEmployeeLogin(fixture, "backup", { siteId, departmentId });
    const manager = await createHrScopedUser(fixture, "team_manager", "planmanager", { site_id: siteId });
    const client = await createHrScopedUser(fixture, "client_viewer", "planclient", { site_id: siteId });
    await hrRpc(fixture, "hr_adjust_leave_balance", { p_actor_id: fixture.hr.id, p_employee_id: absent.employeeId, p_kind: "INITIAL", p_days: 10, p_reason: "Solde de test", p_revision: 1 });
    await hrRpc(fixture, "hr_create_leave", { p_actor_id: fixture.hr.id, p_employee_id: absent.employeeId, p_leave_type: "PAID_LEAVE", p_start: "2026-11-09", p_end: "2026-11-13", p_reason: "Raison personnelle confidentielle" });

    await signInAsE2EUser(page, { email: manager.email, password: fixture.password, targetPath: "/team/leaves", expectedPath: /\/team\/leaves$/ });
    const approve = page.getByRole("form", { name: `Approuver la demande de ${absent.fullName}` });
    await approve.getByLabel("Créer un besoin de remplacement").check();
    await approve.getByRole("button", { name: "Approuver" }).click();
    await expect(page.getByText("Aucune demande en attente.")).toBeVisible();

    await page.goto("/team/planning");
    await expect(page.getByRole("heading", { name: "Planning", level: 1 })).toBeVisible();
    await page.getByText("Nouvelle affectation").click();
    const create = page.getByRole("form", { name: "Nouvelle affectation" });
    await create.getByLabel("Collaborateur").selectOption({ label: `${backup.fullName} (BACKUP-${fixture.suffix.slice(-5).toUpperCase()})` });
    await create.getByLabel("Site").selectOption({ label: "Site Plan (PLAN)" });
    await create.getByLabel("Équipe (facultatif)").selectOption({ label: "Équipe soir — Site Plan" });
    await create.getByLabel("Début").fill("2026-10-01");
    await create.getByRole("button", { name: "Créer l’affectation" }).click();
    await expect(create.getByText("Affectation enregistrée.")).toBeVisible();

    const confirm = page.getByRole("form", { name: `Confirmer un remplaçant pour ${absent.fullName}` });
    await confirm.getByLabel("Remplaçant disponible").selectOption({ index: 1 });
    await confirm.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByText(`Remplaçant : ${backup.fullName}`)).toBeVisible();

    await signInAsE2EUser(page, { email: client.email, password: fixture.password, targetPath: "/client", expectedPath: /\/client$/ });
    await expect(page.getByText(`Absence de ${absent.fullName}`)).toBeVisible();
    await expect(page.getByText(`Remplaçant : ${backup.fullName}`)).toBeVisible();
    await expect(page.getByText(backup.fullName).first()).toBeVisible();
    await expect(page.getByText("Raison personnelle confidentielle")).toHaveCount(0);
    await expect(page.getByText("Congé payé")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
