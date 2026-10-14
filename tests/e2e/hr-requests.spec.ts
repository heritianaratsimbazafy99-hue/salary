import { expect, test } from "@playwright/test";

import { appUrl, createHrE2EFixture, createHrEmployeeLogin, createHrOrganisation, createHrScopedUser, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("employee opens an HR request, HR resolves it; colleagues and managers never see it", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createHrE2EFixture();
  try {
    const org = await createHrOrganisation(fixture, "Demandes");
    const owner = await createHrEmployeeLogin(fixture, "requester", org);
    const colleague = await createHrEmployeeLogin(fixture, "colleague", org);
    const manager = await createHrScopedUser(fixture, "team_manager", "reqmanager", { site_id: org.siteId });

    await signInAsE2EUser(page, { email: owner.email, password: fixture.password, targetPath: "/employee/requests", expectedPath: /\/employee\/requests$/ });
    const form = page.getByRole("form", { name: "Nouvelle demande RH" });
    await form.getByLabel("Catégorie").selectOption("PAYROLL");
    await form.getByLabel("Sujet").fill("Attestation de salaire");
    await form.getByLabel("Message").fill("Merci de me fournir une attestation pour ma banque.");
    await form.getByRole("button", { name: "Envoyer" }).click();
    await expect(form.getByText("Demande envoyée au service RH.")).toBeVisible();
    await expect(page.getByText("Ouverte", { exact: true })).toBeVisible();

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/requests?agencyId=${fixture.agencyId}`, expectedPath: /\/hr\/requests/ });
    const reply = page.getByRole("form", { name: "Répondre à Attestation de salaire" });
    await reply.getByLabel("Réponse").fill("Votre attestation est déposée dans vos documents.");
    await reply.getByRole("button", { name: "Enregistrer la réponse" }).click();
    // Resolved: the reply is shown and the reply form disappears.
    await expect(page.getByText("Votre attestation est déposée dans vos documents.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Répondre à Attestation de salaire" })).toHaveCount(0);

    await signInAsE2EUser(page, { email: owner.email, password: fixture.password, targetPath: "/employee/requests", expectedPath: /\/employee\/requests$/ });
    await expect(page.getByText("Votre attestation est déposée dans vos documents.")).toBeVisible();

    await signInAsE2EUser(page, { email: colleague.email, password: fixture.password, targetPath: "/employee/requests", expectedPath: /\/employee\/requests$/ });
    await expect(page.getByText("Attestation de salaire")).toHaveCount(0);

    await signInAsE2EUser(page, { email: manager.email, password: fixture.password, targetPath: "/team", expectedPath: /\/team$/ });
    for (const path of ["/employee/requests", "/hr/requests"]) {
      await page.goto(appUrl(path));
      await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();
    }
  } finally {
    await fixture.cleanup();
  }
});
