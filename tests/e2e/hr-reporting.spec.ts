import { expect, test } from "@playwright/test";

import { E2E_CRON_BEARER, appUrl, createHrE2EFixture, createHrEmployeeLogin, createHrScopedUser, hrRpc, signInAsE2EUser } from "./helpers/supabase-fixtures";

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

test("dashboards and exports follow each scope; contract alerts are sent once", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await createHrE2EFixture();
  try {
    const north = await hrRpc<string>(fixture, "hr_save_site", { p_actor_id: fixture.hr.id, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Site Nord", p_code: "NORD", p_active: true, p_revision: null });
    const south = await hrRpc<string>(fixture, "hr_save_site", { p_actor_id: fixture.hr.id, p_site_id: null, p_agency_id: fixture.agencyId, p_name: "Site Sud", p_code: "SUD", p_active: true, p_revision: null });
    const department = await hrRpc<string>(fixture, "hr_save_department", { p_actor_id: fixture.hr.id, p_department_id: null, p_agency_id: fixture.agencyId, p_name: "Opérations", p_active: true, p_revision: null });
    const ending = await createHrEmployeeLogin(fixture, "ending", { siteId: north, departmentId: department });
    const southern = await createHrEmployeeLogin(fixture, "southern", { siteId: south, departmentId: department });
    // A fixed-term contract ending in 10 days, assigned on its site.
    await hrRpc(fixture, "hr_save_employee_record", { p_actor_id: fixture.hr.id, p_employee_id: ending.employeeId, p_job_title: "Agent", p_department_id: department, p_site_id: north,
      p_team_id: null, p_manager_profile_id: null, p_status: "ACTIVE", p_contract_type: "CDD", p_contract_start: isoDay(-30), p_contract_end: isoDay(10), p_revision: 1 });
    await hrRpc(fixture, "hr_save_assignment", { p_actor_id: fixture.hr.id, p_assignment_id: null, p_employee_id: ending.employeeId, p_site_id: north, p_team_id: null,
      p_start: isoDay(-30), p_end: isoDay(10), p_status: "ACTIVE", p_revision: null });
    const client = await createHrScopedUser(fixture, "client_viewer", "reportclient", { site_id: south });
    await hrRpc(fixture, "admin_set_report_subscription", { p_actor_id: fixture.superAdmin.id, p_profile_id: fixture.hr.id, p_kind: "CONTRACT_ALERTS", p_agency_id: fixture.agencyId, p_enabled: true });

    await signInAsE2EUser(page, { email: fixture.hr.email, password: fixture.password, targetPath: `/hr/dashboard?agencyId=${fixture.agencyId}`, expectedPath: /\/hr\/dashboard/ });
    await expect(page.getByRole("heading", { name: "Tableau de bord RH", level: 1 })).toBeVisible();
    await expect(page.getByText("Absentéisme")).toBeVisible();
    await expect(page.getByText("J-10")).toBeVisible();
    await expect(page.getByText("1/1")).toBeVisible();
    const hrCsv = await page.request.get(appUrl(`/api/hr/reports/workforce?agencyId=${fixture.agencyId}`));
    expect(hrCsv.status()).toBe(200);
    const hrText = await hrCsv.text();
    expect(hrText).toContain(ending.fullName);
    expect(hrText).toContain(southern.fullName);

    await signInAsE2EUser(page, { email: client.email, password: fixture.password, targetPath: "/client", expectedPath: /\/client$/ });
    await expect(page.getByRole("heading", { name: "Indicateurs de vos sites" })).toBeVisible();
    await expect(page.getByText("Absentéisme")).toHaveCount(0);
    const clientCsv = await (await page.request.get(appUrl("/api/hr/reports/workforce"))).text();
    expect(clientCsv).toContain(southern.fullName);
    expect(clientCsv).not.toContain(ending.fullName);
    expect((await page.request.get(appUrl("/api/hr/reports/leaves"))).status()).toBe(403);

    // Scheduled alerts: refused without the bearer, sent once with it.
    expect((await page.request.get(appUrl("/api/cron/hr-notifications?task=alerts"))).status()).toBe(401);
    const run = await page.request.get(appUrl("/api/cron/hr-notifications?task=alerts"), { headers: { authorization: E2E_CRON_BEARER } });
    expect(run.status()).toBe(200);
    const mails = async () => (await (await page.request.get(`http://127.0.0.1:55428/messages?to=${encodeURIComponent(fixture.hr.email)}`)).json()) as Array<{ subject: string; html: string }>;
    await expect.poll(async () => (await mails()).length).toBe(1);
    expect((await mails())[0].subject).toContain("arrivent à échéance");
    expect((await mails())[0].html).toContain(ending.fullName);
    expect((await mails())[0].html).not.toContain(southern.fullName);
    expect((await page.request.get(appUrl("/api/cron/hr-notifications?task=alerts"), { headers: { authorization: E2E_CRON_BEARER } })).status()).toBe(200);
    expect((await mails()).length).toBe(1);
  } finally {
    await fixture.admin.from("hr_notification_deliveries").delete().eq("recipient_profile_id", fixture.hr.id);
    await fixture.cleanup();
  }
});
