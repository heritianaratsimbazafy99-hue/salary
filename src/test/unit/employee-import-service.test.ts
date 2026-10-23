import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), parse: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/auth", () => ({ getCurrentAgencyScopedActor: mocks.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/employees/import-parser", () => ({ parseEmployeeImport: mocks.parse }));
import { commitEmployeeImport, previewEmployeeImport, reviewEmployeeImport } from "@/lib/employees/import-service";
describe("employee import server boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: "real-actor", agencyId: "session-agency", role: "agency_manager" }); mocks.rpc.mockResolvedValue({ data: "report-id", error: null }); mocks.parse.mockResolvedValue([{ matricule: "00001" }]); });
  it("derives actor and agency from session and sends only normalized rows", async () => {
    const upload = new File(["xlsx"], "employees.xlsx");
    expect(await previewEmployeeImport(upload)).toBe("report-id");
    expect(mocks.rpc).toHaveBeenCalledWith("agency_preview_employee_import", { p_actor_id: "real-actor", p_agency_id: "session-agency", p_rows: [{ matricule: "00001" }] });
    expect(mocks.parse).toHaveBeenCalledWith(upload);
  });
  it.each(["employee", "team_manager", "client_viewer", "hr_central"])("rejects %s before parsing or privileged RPC", async role => {
    mocks.actor.mockResolvedValue({ id: "actor", agencyId: "agency", role });
    await expect(previewEmployeeImport(new File(["xlsx"], "employees.xlsx"))).rejects.toThrow();
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes exclusions and fingerprint for new review; commit rechecks actor", async () => {
    await reviewEmployeeImport("report-id", "fingerprint", [3]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("agency_review_employee_import", { p_actor_id: "real-actor", p_import_id: "report-id", p_fingerprint: "fingerprint", p_excluded: [3] });
    mocks.actor.mockResolvedValue({ id: "second-manager", agencyId: "session-agency", role: "agency_manager" });
    await commitEmployeeImport("report-id", "fingerprint");
    expect(mocks.rpc).toHaveBeenLastCalledWith("agency_commit_employee_import", { p_actor_id: "second-manager", p_import_id: "report-id", p_fingerprint: "fingerprint" });
  });
  it("propagates SQL conflicts without silently retrying creation", async () => {
    const conflict = { code: "PT409", message: "stale_review" }; mocks.rpc.mockResolvedValue({ data: null, error: conflict });
    await expect(commitEmployeeImport("report-id", "old-fingerprint")).rejects.toEqual(conflict);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
