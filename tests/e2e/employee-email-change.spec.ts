import { expect, test } from "@playwright/test";
import { agencyRpc, createAgencyEmployeeFixture, seedMinimalEmployee } from "./helpers/agency-employees";
import { readAuthEmail } from "./helpers/mail";
import { appUrl, signInAsE2EUser } from "./helpers/supabase-fixtures";

test("owner confirms both actual Auth emails before RH-approved identity change is realised", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await createAgencyEmployeeFixture();
  let ownerAuth = ""; let ownerProfile = "";
  try {
    const employeeId = await seedMinimalEmployee(fixture, `MAIL-${fixture.suffix.slice(-6).toUpperCase()}`, "Email owner", fixture.employeeEmail);
    // Explicitly confirmed test fixture; the email change itself uses real delivered proofs.
    const created = await fixture.admin.auth.admin.createUser({ email: fixture.employeeEmail, password: fixture.password, email_confirm: true });
    expect(created.error).toBeNull(); ownerAuth = created.data.user!.id;
    const profile = await fixture.admin.from("profiles").insert({ auth_user_id: ownerAuth, email: fixture.employeeEmail, full_name: "Email owner", role: "employee" }).select("id").single();
    expect(profile.error).toBeNull(); ownerProfile = profile.data!.id;
    expect((await fixture.admin.from("employees").update({ profile_id: ownerProfile }).eq("id", employeeId)).error).toBeNull();
    const employee = await fixture.admin.from("employees").select("revision").eq("id", employeeId).single();
    const newEmail = `owner-new-${fixture.suffix}@example.com`;
    const requestId = await agencyRpc<string>(fixture, "agency_request_employee_change", { p_actor_id: fixture.manager.id, p_employee_id: employeeId, p_revision: employee.data!.revision, p_lifecycle_revision: 1, p_kind: "EMAIL", p_requested_value: newEmail, p_reason: "Corriger mon adresse de connexion" });
    await agencyRpc(fixture, "hr_decide_employee_change", { p_actor_id: fixture.hr.id, p_request_id: requestId, p_revision: 1, p_approve: true, p_reason: "Correction approuvée, contrôle requis" });
    await signInAsE2EUser(page, { email: fixture.employeeEmail, password: fixture.password, targetPath: "/employee/email-change", expectedPath: /\/employee\/email-change/ });
    await expect(page.getByText("Acceptée par les RH — en attente de vérification.")).toBeVisible();
    await page.getByRole("button", { name: "Recevoir les confirmations" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Vérification demandée" })).toBeVisible();
    const oldProof = await readAuthEmail(page.context().request, fixture.employeeEmail);
    const newProof = await readAuthEmail(page.context().request, newEmail);
    // One mailbox alone is insufficient under Secure Email Change.
    await page.goto(newProof.link);
    await expect.poll(async () => (await fixture.admin.auth.admin.getUserById(ownerAuth)).data.user?.email).toBe(fixture.employeeEmail);
    expect((await fixture.admin.from("employees").select("email").eq("id", employeeId).single()).data?.email).toBe(fixture.employeeEmail);
    await page.goto(appUrl("/employee/email-change"));
    await page.getByRole("button", { name: "J’ai confirmé : finaliser" }).click();
    await expect(page.getByRole("status").filter({ hasText: "encore en attente" })).toBeVisible();
    await page.goto(oldProof.link);
    await expect.poll(async () => (await fixture.admin.auth.admin.getUserById(ownerAuth)).data.user?.email).toBe(newEmail);
    // Auth and database are separate steps; an Auth success alone is not EXECUTED.
    expect((await fixture.admin.from("agency_employee_change_requests").select("status").eq("id", requestId).single()).data?.status).toBe("APPROVED_PENDING_VERIFICATION");
    await page.goto(appUrl("/employee/email-change"));
    await page.getByRole("button", { name: "J’ai confirmé : finaliser" }).click();
    await expect.poll(async () => (await fixture.admin.from("agency_employee_change_requests").select("status").eq("id", requestId).single()).data?.status).toBe("EXECUTED");
    expect((await fixture.admin.from("employees").select("email,profile_id").eq("id", employeeId).single()).data).toEqual({ email: newEmail, profile_id: ownerProfile });
    expect((await fixture.admin.from("profiles").select("email,auth_user_id").eq("id", ownerProfile).single()).data).toEqual({ email: newEmail, auth_user_id: ownerAuth });
    // Reconciliation is idempotent after an interrupted response.
    expect(await agencyRpc(fixture, "complete_employee_email_change", { p_request_id: requestId, p_auth_user_id: ownerAuth })).toBe(true);
    expect((await fixture.admin.from("agency_employee_events").select("id").eq("employee_id", employeeId).eq("action", "employee.email_verified")).data).toHaveLength(1);
  } finally {
    await fixture.cleanup();
    if (ownerProfile) expect((await fixture.admin.from("profiles").delete().eq("id", ownerProfile)).error).toBeNull();
    if (ownerAuth && (await fixture.admin.auth.admin.getUserById(ownerAuth)).data.user) expect((await fixture.admin.auth.admin.deleteUser(ownerAuth)).error).toBeNull();
  }
});

test("unactivated employee confirms delivered dedicated proof explicitly without account reassignment", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const fixture = await createAgencyEmployeeFixture();
  try {
    const employeeId = await seedMinimalEmployee(fixture, `UNMAIL-${fixture.suffix.slice(-6).toUpperCase()}`, "Unactivated email", fixture.employeeEmail);
    const newEmail = `unlinked-new-${fixture.suffix}@example.com`;
    const requestId = await agencyRpc<string>(fixture, "agency_request_employee_change", { p_actor_id: fixture.manager.id, p_employee_id: employeeId, p_revision: 1, p_lifecycle_revision: 1, p_kind: "EMAIL", p_requested_value: newEmail, p_reason: "Corriger avant activation" });
    await agencyRpc(fixture, "hr_decide_employee_change", { p_actor_id: fixture.hr.id, p_request_id: requestId, p_revision: 1, p_approve: true, p_reason: "Nouvelle adresse à vérifier" });
    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: "/hr/agency-requests?status=APPROVED_PENDING_VERIFICATION", expectedPath: /\/hr\/agency-requests/ });
    const form = page.getByRole("form", { name: `Vérifier l’email ${requestId}` });
    await form.getByRole("button", { name: "Envoyer la vérification" }).click();
    await expect(page.getByRole("status").filter({ hasText: "attend la confirmation" })).toBeVisible();
    let link = "";
    await expect.poll(async () => {
      const response = await page.context().request.get(`http://127.0.0.1:55428/messages?to=${encodeURIComponent(newEmail)}`);
      const messages = await response.json() as { html: string }[];
      const html = messages.at(-1)?.html ?? "";
      link = [...html.matchAll(/href="([^"]+)"/g)].map(x => x[1].replaceAll("&amp;", "&")).find(x => new URL(x).pathname === "/auth/email-change") ?? "";
      return Boolean(link);
    }).toBe(true);
    const recipient = await browser.newContext();
    try {
      const confirmPage = await recipient.newPage();
      await confirmPage.goto(link);
      expect((await fixture.admin.from("employees").select("email").eq("id", employeeId).single()).data?.email).toBe(fixture.employeeEmail);
      // A scanner GET does not consume the proof; a modified bearer cannot confirm.
      const invalid = new URL(link); invalid.hash = new URLSearchParams({ request: requestId, token: "b".repeat(43) }).toString();
      await confirmPage.goto(invalid.toString());
      await confirmPage.getByRole("button", { name: "Confirmer ma nouvelle adresse" }).click();
      await expect(confirmPage.getByRole("status")).toContainText("invalide ou expiré");
      await confirmPage.goto(link);
      await confirmPage.getByRole("button", { name: "Confirmer ma nouvelle adresse" }).click();
      await expect(confirmPage.getByRole("status")).toContainText("Nouvelle adresse vérifiée");
      expect((await fixture.admin.from("employees").select("email,profile_id").eq("id", employeeId).single()).data).toEqual({ email: newEmail, profile_id: null });
      expect((await fixture.admin.from("profiles").select("id").eq("email", newEmail)).data).toEqual([]);
      const users = await fixture.admin.auth.admin.listUsers({ perPage: 1000 });
      expect(users.data.users.some(u => u.email === newEmail)).toBe(false);
    } finally { await recipient.close(); }
  } finally { await fixture.cleanup(); }
});
