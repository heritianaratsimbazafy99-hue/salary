import { expect, test } from "@playwright/test";

import { appUrl, createHrE2EFixture, enablePasswordLoginForE2E, findEmployeeProfileByEmail, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("HR organises sites, super admin scopes a client who sees only its site until revoked", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await createHrE2EFixture();
  const code = `S${fixture.suffix.slice(-5).toUpperCase()}`;
  const clientEmail = `codex-client-${fixture.suffix}@example.com`;
  fixture.createdEmails.push(clientEmail);

  try {
    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/organisation?agencyId=${fixture.agencyId}`, expectedPath: /\/hr\/organisation/ });
    await expect(page.getByRole("heading", { name: "Organisation", level: 1 })).toBeVisible();
    const newSite = page.getByRole("form", { name: "Nouveau site" });
    await newSite.getByLabel("Nom du site").fill("Tour E2E");
    await newSite.getByLabel("Code").fill(code.toLowerCase());
    await newSite.getByRole("button", { name: "Ajouter" }).click();
    await expect(newSite.getByText("Site enregistré.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Modifier le site Tour E2E" }).getByLabel("Code")).toHaveValue(code);

    const newDepartment = page.getByRole("form", { name: "Nouveau département" });
    await newDepartment.getByLabel("Nom du département").fill("Service client E2E");
    await newDepartment.getByRole("button", { name: "Ajouter" }).click();
    await expect(newDepartment.getByText("Département enregistré.")).toBeVisible();

    const newTeam = page.getByRole("form", { name: "Nouvelle équipe" });
    await newTeam.getByLabel("Site").selectOption({ label: `Tour E2E (${code})` });
    await newTeam.getByLabel("Nom de l’équipe").fill("Équipe matin");
    await newTeam.getByRole("button", { name: "Ajouter" }).click();
    await expect(newTeam.getByText("Équipe enregistrée.")).toBeVisible();

    // HR manages HR data, not accounts.
    await page.goto(appUrl("/hr/access"));
    await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();

    await signInAsE2EUser(page, { email: fixture.superAdmin.email, password: fixture.password, targetPath: "/hr/access", expectedPath: /\/hr\/access$/ });
    const newAccess = page.getByRole("form", { name: "Nouvel accès RH" });
    await newAccess.getByLabel("Email").fill(clientEmail);
    await newAccess.getByLabel("Nom complet").fill("Client E2E");
    await newAccess.getByLabel("Rôle").selectOption("client_viewer");
    await newAccess.getByLabel(`Tour E2E (${code})`).check();
    await newAccess.getByRole("button", { name: "Créer l’accès" }).click();
    await expect(newAccess.getByText(/Accès créé/)).toBeVisible();

    const client = await findEmployeeProfileByEmail(fixture.admin, clientEmail);
    await enablePasswordLoginForE2E(fixture.admin, { authUserId: client.authUserId, password: fixture.password });
    await signInAsE2EUser(page, { email: clientEmail, password: fixture.password, targetPath: "/client", expectedPath: /\/client$/ });
    await expect(page.getByRole("heading", { name: "Mes sites", level: 1 })).toBeVisible();
    await expect(page.getByText(`Tour E2E (${code})`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Organisation" })).toHaveCount(0);
    for (const path of ["/hr/organisation", "/hr/access", "/team", "/employee/payslips"]) {
      await page.goto(appUrl(path));
      await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();
    }

    // Revocation applies to the client's existing session.
    const clientCookies = await page.context().cookies();
    await signInAsE2EUser(page, { email: fixture.superAdmin.email, password: fixture.password, targetPath: "/hr/access", expectedPath: /\/hr\/access$/ });
    await page.getByRole("form", { name: `Révoquer l’accès de ${clientEmail}` }).getByRole("button", { name: "Révoquer" }).click();
    await expect(page.getByRole("form", { name: `Rétablir l’accès de ${clientEmail}` })).toBeVisible();
    await page.context().clearCookies();
    await page.context().addCookies(clientCookies);
    await page.goto(appUrl("/client"));
    await expect(page.getByRole("heading", { name: "Acces refuse" })).toBeVisible();
    await expect(page.getByText(`Tour E2E (${code})`)).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
