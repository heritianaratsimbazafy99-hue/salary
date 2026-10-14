import { expect, test } from "@playwright/test";

import { createHrE2EFixture, createHrEmployeeLogin, createHrOrganisation, createHrScopedUser, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("leave lifecycle: balance, request, manager approval without reasons, single debit, overlap refusal and HR cancellation", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createHrE2EFixture();
  try {
    const { siteId, departmentId } = await createHrOrganisation(fixture, "Conges");
    const employee = await createHrEmployeeLogin(fixture, "leaver", { siteId, departmentId });
    const manager = await createHrScopedUser(fixture, "team_manager", "leavemanager", { site_id: siteId });

    // HR sets the initial balance with a reason.
    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/employees/${employee.employeeId}`, expectedPath: /\/hr\/employees\// });
    const balanceForm = page.getByRole("form", { name: "Corriger le solde" });
    await balanceForm.getByLabel("Jours (+ ou −)").fill("10");
    await balanceForm.getByLabel("Motif").fill("Reprise du solde au 1er octobre");
    await balanceForm.getByRole("button", { name: "Enregistrer" }).click();
    await expect(balanceForm.getByText("Solde mis à jour.")).toBeVisible();

    // The employee files a paid leave (3 business days).
    await signInAsE2EUser(page, { email: employee.email, password: fixture.password, targetPath: "/employee/leaves", expectedPath: /\/employee\/leaves$/ });
    await expect(page.getByText("10 j").first()).toBeVisible();
    const requestForm = page.getByRole("form", { name: "Nouvelle demande de congé" });
    await requestForm.getByLabel("Premier jour").fill("2026-11-02");
    await requestForm.getByLabel("Dernier jour").fill("2026-11-04");
    await requestForm.getByLabel("Motif").fill("Mariage de ma sœur");
    await requestForm.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(requestForm.getByText(/Demande envoyée/)).toBeVisible();

    // The in-scope manager approves without ever seeing the personal reason.
    await signInAsE2EUser(page, { email: manager.email, password: fixture.password, targetPath: "/team/leaves", expectedPath: /\/team\/leaves$/ });
    await expect(page.getByText(employee.fullName).first()).toBeVisible();
    await expect(page.getByText("Mariage de ma sœur")).toHaveCount(0);
    const approve = page.getByRole("form", { name: `Approuver la demande de ${employee.fullName}` });
    await approve.getByRole("button", { name: "Approuver" }).click();
    // The decided request leaves the pending queue as soon as the page refreshes.
    await expect(page.getByText("Aucune demande en attente.")).toBeVisible();

    // The balance was debited once; an overlapping request is refused.
    await signInAsE2EUser(page, { email: employee.email, password: fixture.password, targetPath: "/employee/leaves", expectedPath: /\/employee\/leaves$/ });
    await expect(page.getByText("Approuvé", { exact: true })).toBeVisible();
    await expect(page.getByText("7 j").first()).toBeVisible();
    await expect(page.getByText("Congé approuvé", { exact: true })).toBeVisible();
    await requestForm.getByLabel("Premier jour").fill("2026-11-04");
    await requestForm.getByLabel("Dernier jour").fill("2026-11-05");
    await requestForm.getByLabel("Motif").fill("Prolongation");
    await requestForm.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(requestForm.getByRole("alert")).toContainText("couvre déjà une partie");
    const { count: debits } = await fixture.admin.from("leave_balance_movements").select("id", { count: "exact", head: true }).eq("employee_id", employee.employeeId).eq("kind", "APPROVAL_DEBIT");
    expect(debits).toBe(1);

    // HR cancels the approved leave: the days are credited back.
    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: "/hr/leaves?status=APPROVED", expectedPath: /\/hr\/leaves/ });
    await expect(page.getByText("Mariage de ma sœur")).toBeVisible();
    await page.getByText("Annuler ce congé (recrédit)").click();
    const cancel = page.getByRole("form", { name: "Annuler la demande du 2 nov. 2026" });
    await cancel.getByLabel("Motif de l’annulation").fill("Événement reporté");
    await cancel.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(page.getByText("Aucune demande pour ces filtres.")).toBeVisible();
    const { data: balance } = await fixture.admin.from("leave_balances").select("balance_days").eq("employee_id", employee.employeeId).single();
    expect(balance?.balance_days).toBe(10);
  } finally {
    await fixture.cleanup();
  }
});
