import { expect, test, type APIRequestContext } from "@playwright/test";
import { appUrl, signInAsE2EUser } from "./helpers/supabase-fixtures";
import { agencyRpc, createAgencyEmployeeFixture, employeeRow, seedMinimalEmployee } from "./helpers/agency-employees";

async function messages(request: APIRequestContext, email: string) {
  const response = await request.get(`http://127.0.0.1:55428/messages?to=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  return await response.json() as { id: string; html: string; subject: string }[];
}

test("explicit individual and selected invitations work before payroll and retry the same durable delivery", async ({ page }) => {
  test.setTimeout(150_000);
  const fixture = await createAgencyEmployeeFixture();
  try {
    await fixture.managerLogin(page);
    await page.getByRole("link", { name: "Nouveau salarié" }).click();
    const form = page.getByRole("form", { name: "Créer un salarié" });
    const matricule = `INV-${fixture.suffix.slice(-6).toUpperCase()}`;
    await form.getByLabel("Matricule", { exact: true }).fill(matricule);
    await form.getByLabel("Nom complet").fill("Invitation individuelle E2E");
    await form.getByLabel("Email de connexion").fill(fixture.employeeEmail);
    await form.getByRole("button", { name: "Créer le salarié" }).click();
    await expect(page).toHaveURL(/\/manager\/employees\/[0-9a-f-]+$/);
    const employee = await employeeRow(fixture, matricule);
    expect(await messages(page.request, fixture.employeeEmail)).toEqual([]);
    expect((await fixture.admin.from("payslips").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    expect((await fixture.admin.from("employee_invitations").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    expect(employee.profile_id).toBeNull();
    const foreignInvitation = await page.request.post(appUrl("/api/manager/employees/invitations"), { headers: { origin: "https://foreign.example.test" }, data: { employeeIds: [employee.id], idempotencyKey: crypto.randomUUID() } });
    expect(foreignInvitation.status()).toBe(403);
    expect((await fixture.admin.from("agency_invitation_jobs").select("id").eq("employee_id", employee.id)).data).toEqual([]);
    expect(await messages(page.request, fixture.employeeEmail)).toEqual([]);


    let operation: { employeeIds: string[]; idempotencyKey: string } | undefined;
    // Deliver through the actual server and local Resend SDK, but lose the HTTP
    // acknowledgement in this browser to exercise the explicit retry action.
    await page.route("**/api/manager/employees/invitations", async (route) => {
      operation = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
      await page.unroute("**/api/manager/employees/invitations");
    });
    await page.getByRole("button", { name: "Confirmer et envoyer les invitations" }).click();
    await expect(page.getByRole("status").filter({ hasText: /fetch|réseau|Failed|Network/i })).toBeVisible();
    const firstMessages = await messages(page.request, fixture.employeeEmail);
    expect(firstMessages).toHaveLength(1);
    expect(firstMessages[0].html).toContain("Vos fiches apparaîtront après leur publication");
    expect(firstMessages[0].html).not.toContain("Votre première fiche de paie est disponible");
    const firstJob = await fixture.admin.from("agency_invitation_jobs").select("id,operation_id,status").eq("employee_id", employee.id).single();
    expect(firstJob.error).toBeNull();
    expect(firstJob.data!.operation_id).toBe(operation!.idempotencyKey);
    const invitation = await fixture.admin.from("employee_invitations").select("token_hash").eq("agency_id", fixture.agencyId).eq("employee_id", matricule).single();
    // Model the provider acknowledgement having succeeded while durable result
    // recording failed. Retrying must use its existing token and provider key.
    expect((await fixture.admin.from("agency_invitation_jobs").update({ status: "FAILED", lease_until: null }).eq("id", firstJob.data!.id)).error).toBeNull();
    await page.getByRole("button", { name: "Confirmer et envoyer les invitations" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 invitation(s) envoyée(s)" })).toBeVisible();
    expect(await messages(page.request, fixture.employeeEmail)).toHaveLength(1);
    expect((await fixture.admin.from("employee_invitations").select("token_hash").eq("agency_id", fixture.agencyId).eq("employee_id", matricule).single()).data).toEqual(invitation.data);
    const replay = await page.request.post(appUrl("/api/manager/employees/invitations"), { data: operation, headers: { origin: new URL(appUrl("/")).origin } });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.sent).toBe(0);
    expect(await messages(page.request, fixture.employeeEmail)).toHaveLength(1);

    const emails = [`selected-a-${fixture.suffix}@example.com`, `selected-b-${fixture.suffix}@example.com`];
    const ids = await Promise.all(emails.map((email, index) => seedMinimalEmployee(fixture, `SEL-${index}-${fixture.suffix.slice(-6).toUpperCase()}`, `Sélection ${index} E2E`, email)));
    await page.goto(appUrl("/manager/employees"));
    for (let index = 0; index < emails.length; index++) await page.getByRole("checkbox", { name: `Inviter Sélection ${index} E2E — ${emails[index]}` }).check();
    const selected = page.getByRole("region", { name: "Invitations de la sélection" });
    for (const email of emails) await expect(selected.getByText(email, { exact: false })).toBeVisible();
    await selected.getByRole("button", { name: "Confirmer et envoyer les invitations" }).click();
    await expect(selected.getByRole("status")).toContainText("2 invitation(s) envoyée(s)");
    for (const email of emails) expect(await messages(page.request, email)).toHaveLength(1);
    expect((await fixture.admin.from("employees").select("profile_id").in("id", ids)).data).toEqual([{ profile_id: null }, { profile_id: null }]);
    expect((await fixture.admin.from("profiles").select("id").in("email", [fixture.employeeEmail, ...emails])).data).toEqual([]);
  } finally {
    await fixture.admin.from("agency_invitation_jobs").delete().eq("actor_id", fixture.manager.id);
    await fixture.cleanup();
  }
});

test("RH approves exact departed payroll version, row corrections invalidate it and publication preserves archived access", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createAgencyEmployeeFixture();
  try {
    const matricule = `PAY-${fixture.suffix.slice(-6).toUpperCase()}`;
    const employeeId = await seedMinimalEmployee(fixture, matricule, "Dossier officiel E2E", fixture.employeeEmail);
    const employee = await employeeRow(fixture, matricule);
    const lifecycle = await fixture.admin.from("employee_employment_lifecycle").select("revision").eq("employee_id", employeeId).single();
    await agencyRpc(fixture, "agency_depart_employee", { p_actor_id: fixture.manager.id, p_employee_id: employeeId, p_revision: employee.revision, p_lifecycle_revision: lifecycle.data!.revision, p_departed_on: "2026-01-05", p_reason: "CONTRACT_END" });
    expect((await fixture.admin.from("employees").update({ is_active: false }).eq("id", employeeId)).error).toBeNull();
    const payroll = await fixture.admin.from("payroll_imports").insert({ agency_id: fixture.agencyId, period_start: fixture.periodStart, period_end: fixture.periodEnd, uploaded_by: fixture.manager.id, source_filename: "departure-e2e.xlsx", status: "READY_FOR_PREVIEW", valid_row_count: 1, invalid_row_count: 0, unknown_employee_count: 0 }).select("id").single();
    expect(payroll.error).toBeNull();
    const importId = payroll.data!.id;
    const row = await fixture.admin.from("payroll_import_rows").insert({ import_id: importId, agency_id: fixture.agencyId, employee_id: matricule, employee_email: fixture.employeeEmail, employee_name: "Nom historique de paie", normalized_data: { employeeName: "Nom historique de paie", employeeId: matricule, email: fixture.employeeEmail, grossAmount: 100, deductionsTotal: 10, netAmount: 90, periodStart: fixture.periodStart, periodEnd: fixture.periodEnd } });
    expect(row.error).toBeNull();
    await fixture.managerLogin(page);
    await page.goto(appUrl(`/manager/imports/${importId}`));
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    let review = page.getByRole("dialog", { name: "Vérifier avant publication" });
    await expect(review.getByText(/validation RH obligatoire/)).toBeVisible();
    await expect(review.getByText(/Des noms diffèrent/)).toBeVisible();
    await review.getByRole("checkbox").check();
    let publication = page.waitForResponse(response => response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await publication).status()).toBe(409);
    expect((await fixture.admin.from("payslips").select("id").eq("employee_id", employeeId)).data).toEqual([]);

    let firstApproval = true;
    const approve = async () => {
      await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/payroll-departure-review/${importId}`, expectedPath: /\/hr\/payroll-departure-review\// });
      await expect(page.getByText(`${"Nom historique de paie"} · ${matricule} — parti`)).toBeVisible();
      if (firstApproval) {
        const current = await fixture.admin.rpc("review_payroll_import", { p_import_id: importId });
        expect(current.error).toBeNull();
        const foreignApproval = await page.request.post(appUrl(`/api/hr/imports/${importId}/departure-approval`), { headers: { origin: "https://foreign.example.test" }, data: { confirmed: true, fingerprint: current.data.fingerprint } });
        expect(foreignApproval.status()).toBe(403);
        expect((await fixture.admin.from("payroll_departure_approvals").select("import_id").eq("import_id", importId)).data).toEqual([]);
        firstApproval = false;
      }

      await page.getByRole("button", { name: "Valider cette version pour les salariés partis" }).click();
      await expect(page.getByRole("status")).toContainText("Cette version précise est validée");
    };
    await approve();
    const initial = await fixture.admin.from("payroll_departure_approvals").select("fingerprint").eq("import_id", importId).single();
    expect(initial.error).toBeNull();
    // A correction to the reviewed rows changes the exact approved version.
    const correction = await fixture.admin.from("payroll_import_rows").update({ normalized_data: { employeeName: "Nom historique de paie", employeeId: matricule, email: fixture.employeeEmail, grossAmount: 110, deductionsTotal: 10, netAmount: 100, periodStart: fixture.periodStart, periodEnd: fixture.periodEnd } }).eq("import_id", importId);
    expect(correction.error).toBeNull();
    await fixture.managerLogin(page);
    await page.goto(appUrl(`/manager/imports/${importId}`));
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    review = page.getByRole("dialog", { name: "Vérifier avant publication" });
    await review.getByRole("checkbox").check();
    publication = page.waitForResponse(response => response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await publication).status()).toBe(409);
    await approve();
    const approved = await fixture.admin.from("payroll_departure_approvals").select("fingerprint").eq("import_id", importId).single();
    expect(approved.data!.fingerprint).not.toBe(initial.data!.fingerprint);
    await fixture.managerLogin(page);
    await page.goto(appUrl(`/manager/imports/${importId}`));
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    review = page.getByRole("dialog", { name: "Vérifier avant publication" });
    await review.getByRole("checkbox").check();
    publication = page.waitForResponse(response => response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
    expect((await publication).status()).toBe(200);
    expect(await employeeRow(fixture, matricule)).toMatchObject({ id: employeeId, full_name: "Dossier officiel E2E", is_active: false, profile_id: null });
    expect((await fixture.admin.from("employee_employment_lifecycle").select("state").eq("employee_id", employeeId).single()).data!.state).toBe("DEPARTED");
    expect((await fixture.admin.from("payslip_versions").select("snapshot_data").eq("import_id", importId).single()).data!.snapshot_data).toMatchObject({ employeeName: "Nom historique de paie", netAmount: 100 });
    expect((await fixture.admin.from("employee_invitations").select("id").eq("agency_id", fixture.agencyId)).data).toEqual([]);
    expect(await messages(page.request, fixture.employeeEmail)).toEqual([]);
  } finally {
    await fixture.admin.from("agency_invitation_jobs").delete().eq("actor_id", fixture.manager.id);
    await fixture.cleanup();
  }
});
