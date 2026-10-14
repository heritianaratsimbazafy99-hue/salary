import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildContractAlertEmail, buildMonthlyReportEmail } from "../../lib/notifications/resend";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
const notifications = vi.hoisted(() => ({ runContractAlerts: vi.fn(), runMonthlyReports: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const dashboard = {
  period: { start: "2026-10-01", end: "2026-10-31", business_days: 22, today: "2026-10-14" },
  role: "client_viewer",
  sites: [{ site_id: "s", site_name: "=HYPERLINK(\"x\")", site_code: "S", headcount: 4, assigned: 3, absence_days: null, open_replacements: 1, confirmed_replacements: 2, contracts_ending_30: 0 }],
  totals: { headcount: 4, assigned: 3, entries: 1, exits: 0, absence_days: null, open_replacements: 1, confirmed_replacements: 2, avg_replacement_hours: 5, contracts_ending_30: 0, contracts_ending_60: 1, contracts_ending_90: 1, pending_leaves: null },
  hr: null,
  expiring: [],
};

function serverClient(role: string) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };
}

describe("HR indicators", () => {
  it("computes coverage and absenteeism without dividing by zero", async () => {
    const { absenteeismRate, coverageRate } = await import("../../lib/hr/reporting");
    expect(coverageRate(4, 3)).toBe(0.75);
    expect(coverageRate(0, 0)).toBe(0);
    expect(absenteeismRate(11, 5, 22)).toBe(0.1);
    expect(absenteeismRate(null, 5, 22)).toBeNull();
  });

  it("omits absence figures from a client's monthly report and neutralizes CSV formulas", async () => {
    const { monthlySummary } = await import("../../lib/hr/notifications");
    const { summary, csv } = monthlySummary(dashboard as never);
    expect(summary.map((row) => row.label)).not.toContain("Taux d’absentéisme");
    expect(csv).not.toContain("Jours d’absence");
    expect(csv).toContain("'=HYPERLINK");
    expect(summary.find((row) => row.label.startsWith("Taux de couverture"))?.value).toBe("75 %");
  });

  it("escapes names in alert and report emails", () => {
    const alert = buildContractAlertEmail({ recipientName: "<b>RH</b>", appUrl: "https://app.example", items: [{ fullName: "<script>x</script>", matricule: "M1", siteName: "S", agencyName: "A", contractType: "CDD", contractEnd: "2026-10-24", daysLeft: 10 }] });
    expect(alert.html).not.toContain("<script>");
    expect(alert.html).toContain("J-10");
    const report = buildMonthlyReportEmail({ recipientName: "Client", appUrl: "https://app.example", agencyName: "<i>Airtel</i>", monthLabel: "octobre 2026", summary: [{ label: "Effectif", value: "4" }], dashboardPath: "/client" });
    expect(report.subject).toBe("Rapport RH octobre 2026 — <i>Airtel</i>");
    expect(report.html).not.toContain("<i>Airtel</i>");
    expect(report.html).toContain("https://app.example/client");
  });
});

describe("HR scheduled notifications route", () => {
  beforeEach(() => {
    vi.resetModules();
    notifications.runContractAlerts.mockReset().mockResolvedValue({ recipients: 1, sent: 1, skipped: 0, failed: 0 });
    notifications.runMonthlyReports.mockReset().mockResolvedValue({ recipients: 0, sent: 0, skipped: 0, failed: 0 });
    vi.doMock("../../lib/hr/notifications", () => notifications);
  });

  it("refuses calls without a configured or matching secret", async () => {
    const { GET } = await import("../../app/api/cron/hr-notifications/route");
    const { NextRequest } = await import("next/server");
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new NextRequest("http://local.test/api/cron/hr-notifications?task=alerts", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s".repeat(40));
    expect((await GET(new NextRequest("http://local.test/api/cron/hr-notifications?task=alerts", { headers: { authorization: `Bearer ${"t".repeat(40)}` } }))).status).toBe(401);
    expect(notifications.runContractAlerts).not.toHaveBeenCalled();
    const ok = await GET(new NextRequest("http://local.test/api/cron/hr-notifications?task=alerts", { headers: { authorization: `Bearer ${"s".repeat(40)}` } }));
    expect(ok.status).toBe(200);
    expect(notifications.runContractAlerts).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe("HR report exports", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it("refuses the payroll leave export to a client viewer and audits nothing", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("client_viewer"));
    const { GET } = await import("../../app/api/hr/reports/[kind]/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://local.test/api/hr/reports/leaves"), { params: Promise.resolve({ kind: "leaves" }) });
    expect(response.status).toBe(403);
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });
});
