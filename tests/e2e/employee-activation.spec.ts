import { expect, test } from "@playwright/test";

import { readActivationEmail, readAuthEmail, readInvitationEmail } from "./helpers/mail";
import {
  appUrl,
  createPayrollE2EFixture,
  createPayrollWorkbook,
  signInAsE2EUser,
} from "./helpers/supabase-fixtures";

test("new employee activates from delivered invitation, reads payslip and signs in again", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createPayrollE2EFixture();
  const runtimeErrors: string[] = [];
  const callbackRedirects: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/auth/callback") {
      const location = response.headers().location;
      const target = location ? new URL(location, url) : null;
      if (target) callbackRedirects.push(`${target.origin}${target.pathname}`);
    }
  });
  const request = page.context().request;

  try {
    // Only manager and HR are provisioned. The employee must not exist in Auth or profiles.
    const usersBefore = await fixture.admin.auth.admin.listUsers({ perPage: 1000 });
    expect(usersBefore.error).toBeNull();
    expect(usersBefore.data.users.some((user) => user.email === fixture.employeeEmail)).toBe(false);
    const profileBefore = await fixture.admin.from("profiles").select("id").eq("email", fixture.employeeEmail);
    expect(profileBefore.data).toEqual([]);

    const workbookPath = await createPayrollWorkbook(testInfo, {
      employeeEmail: fixture.employeeEmail,
      periodEnd: fixture.periodEnd,
      periodStart: fixture.periodStart,
      suffix: fixture.suffix,
    });
    await signInAsE2EUser(page, {
      email: fixture.manager.email,
      expectedPath: /\/manager\/imports$/,
      password: fixture.password,
      targetPath: "/manager/imports",
    });
    await page.getByLabel("Debut de periode").fill(fixture.periodStart);
    await page.getByLabel("Fin de periode").fill(fixture.periodEnd);
    await page.getByLabel("Fichier Excel").setInputFiles(workbookPath);
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await page.waitForURL(/\/manager\/imports\/[0-9a-f-]+$/);
    const importPath = new URL(page.url()).pathname;
    await page.getByLabel("Categorie").selectOption("BENEFIT");
    await page.getByRole("button", { name: "Enregistrer les mappings" }).click();
    await expect(page.getByRole("heading", { name: "Mapping des colonnes" })).toHaveCount(0);
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    const publicationReview = page.getByRole("dialog", { name: "Vérifier avant publication" });
    await expect(publicationReview.getByText(fixture.employeeEmail, { exact: true })).toBeVisible();
    await expect(publicationReview.getByRole("button", { name: "Confirmer la publication", exact: true })).toBeDisabled();
    await publicationReview.getByRole("checkbox", { name: "Je confirme les destinataires et la publication de toutes les fiches valides." }).check();
    const publicationResponse = page.waitForResponse((response) =>
      response.url().endsWith("/publish") && response.request().method() === "POST",
    { timeout: 15_000 });
    await publicationReview.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await publicationResponse).status()).toBe(200);
    await expect(page.locator('[aria-current="step"]').filter({ hasText: "Publication" })).toBeVisible({ timeout: 15_000 });

    // The link is taken from the actual rendered Resend message, never from a DB hash or admin-generated link.
    let invitationLink = await readInvitationEmail(request, fixture.employeeEmail);
    await page.context().clearCookies();
    await page.goto(invitationLink);
    await expect(page.getByLabel("Email professionnel")).toBeVisible();
    await expect(page).toHaveTitle(/MadajobPay/);
    await page.screenshot({ path: `/tmp/madajobpay-invitation-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });

    // Owning the invitation URL alone must not allow a different address to activate it.
    await page.getByLabel("Email professionnel").fill(`wrong-${fixture.suffix}@example.com`);
    await page.getByRole("button", { name: /Recevoir/ }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    const usersAfterWrongEmail = await fixture.admin.auth.admin.listUsers({ perPage: 1000 });
    expect(usersAfterWrongEmail.data.users.some((user) => user.email === `wrong-${fixture.suffix}@example.com`)).toBe(false);

    // Revoked and expired tokens are rejected. The manager then sends a fresh invitation through the UI.
    const { data: invitation } = await fixture.admin.from("employee_invitations")
      .select("id,expires_at").eq("agency_id", fixture.agencyId).eq("email", fixture.employeeEmail).single();
    expect(invitation).not.toBeNull();
    const revoked = await fixture.admin.from("employee_invitations").update({ status: "REVOKED" }).eq("id", invitation!.id);
    expect(revoked.error).toBeNull();
    await page.goto(invitationLink);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Email professionnel")).toHaveCount(0);
    const expired = await fixture.admin.from("employee_invitations")
      .update({ status: "PENDING", expires_at: "2020-01-01T00:00:00Z" }).eq("id", invitation!.id);
    expect(expired.error).toBeNull();
    await page.goto(invitationLink);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("expiré");
    await expect(page.getByLabel("Email professionnel")).toHaveCount(0);
    const agedInvitation = await fixture.admin.from("employee_invitations")
      .update({ updated_at: "2020-01-01T00:00:00Z" }).eq("id", invitation!.id);
    expect(agedInvitation.error).toBeNull();
    const managerBrowser = await browser.newContext();
    try {
      const managerPage = await managerBrowser.newPage();
      await signInAsE2EUser(managerPage, {
        email: fixture.manager.email,
        expectedPath: /\/manager\/imports\/[0-9a-f-]+$/,
        password: fixture.password,
        targetPath: importPath,
      });
      await managerPage.getByRole("button", { name: "Renvoyer les invitations" }).click();
      await expect(managerPage.getByRole("status").filter({ hasText: "invitation(s)" })).toContainText("1 invitation(s) envoyée(s), 0 échec(s)");
    } finally {
      await managerBrowser.close();
    }
    await page.goto(invitationLink);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    const renewedLink = await readInvitationEmail(request, fixture.employeeEmail);
    expect(renewedLink !== invitationLink).toBe(true);
    invitationLink = renewedLink;

    await page.goto(invitationLink);
    await page.getByLabel("Email professionnel").fill(fixture.employeeEmail);
    await page.getByRole("button", { name: /Recevoir/ }).click();
    await expect(page.getByRole("status")).toBeVisible();
    const beforeVerification = await fixture.admin.from("profiles").select("id").eq("email", fixture.employeeEmail);
    expect(beforeVerification.data).toEqual([]);
    const pendingUsers = await fixture.admin.auth.admin.listUsers({ perPage: 1000 });
    const unconfirmedUser = pendingUsers.data.users.find((user) => user.email === fixture.employeeEmail);
    expect(unconfirmedUser).toBeDefined();
    expect(unconfirmedUser?.email_confirmed_at).toBeFalsy();
    const confirmationLink = await readActivationEmail(request, fixture.employeeEmail);
    await page.getByLabel("Email professionnel").fill(fixture.employeeEmail);
    await page.getByRole("button", { name: "Renvoyer le lien de vérification" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Patientez une minute");

    // A forwarded confirmation opened without its requesting browser cannot activate the account.
    const wrongBrowser = await browser.newContext();
    try {
      const otherPage = await wrongBrowser.newPage();
      await otherPage.goto(confirmationLink);
      await expect(otherPage.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: "Mes fiches de paie" })).toHaveCount(0);
    } finally {
      await wrongBrowser.close();
    }
    // Even the request-bound cookie does not authorize a substituted verification token.
    const tamperedBrowser = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const otherPage = await tamperedBrowser.newPage();
      const tamperedLink = new URL(confirmationLink);
      tamperedLink.searchParams.set("token_hash", "b".repeat(64));
      await otherPage.goto(tamperedLink.toString());
      await expect(otherPage.getByRole("main").getByRole("alert")).toBeVisible();
    } finally {
      await tamperedBrowser.close();
    }
    const stillUnverified = await fixture.admin.from("profiles").select("id").eq("email", fixture.employeeEmail);
    expect(stillUnverified.data).toEqual([]);
    await page.goto(confirmationLink);
    await page.waitForURL(/\/employee\/payslips$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).toBeVisible();
    await expect(page.getByText("Rina Salary")).toBeVisible();
    await expect(page.getByText("cafeteria")).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger CSV" })).toBeVisible();
    const exported = await request.get(appUrl("/api/employee/payslips/export"));
    expect(exported.status()).toBe(200);
    expect(await exported.text()).toContain("Rina Salary");
    const accepted = await fixture.admin.from("employee_invitations").select("status").eq("id", invitation!.id).single();
    expect(accepted.data?.status).toBe("ACCEPTED");
    const profile = await fixture.admin.from("profiles").select("id,role").eq("email", fixture.employeeEmail).single();
    expect(profile.data?.role).toBe("employee");
    const employee = await fixture.admin.from("employees").select("profile_id").eq("agency_id", fixture.agencyId).single();
    expect(employee.data?.profile_id).toBe(profile.data?.id);
    await page.screenshot({ path: `/tmp/madajobpay-activated-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });

    // A completed invitation cannot be replayed to provision another account.
    await page.context().clearCookies();
    await page.goto(invitationLink);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("déjà été utilisée");
    await expect(page.getByLabel("Email professionnel")).toHaveCount(0);

    // Simulate a session ending, then use the ordinary login UI and delivered email.
    await page.context().clearCookies();
    await page.goto(appUrl("/auth/login"));
    await page.getByLabel("Email professionnel").fill(fixture.employeeEmail);
    await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    const secondAuthEmail = await readAuthEmail(request, fixture.employeeEmail);
    await page.goto(secondAuthEmail.link);
    await page.waitForURL(/\/employee\/payslips$/, { timeout: 20_000 });
    await expect(page.getByText("Rina Salary")).toBeVisible();
    await page.goto(appUrl("/manager/imports"));
    await expect(page.getByRole("heading", { name: "Imports de paie" })).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
    expect(callbackRedirects).toEqual([appUrl("/employee/payslips"), appUrl("/employee/payslips")]);
  } finally {
    await fixture.cleanup();
  }
});

test("missing and malformed activation links fail safely", async ({ page }) => {
  for (const path of ["/auth/invitation", "/auth/invitation?token=invalid", `/auth/invitation?token=${"a".repeat(64)}`]) {
    await page.goto(appUrl(path));
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: /Recevoir/ })).toHaveCount(0);
  }
});
