import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentActor: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getCurrentActor: mocks.getCurrentActor }));
vi.mock("@/app/hr/operations/actions", () => ({ sendMonitoringSmoke: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, usePathname: () => "/hr/operations" }));

import OperationsPage from "@/app/hr/operations/page";

describe("operations page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("redirects anonymous visitors to login", async () => {
    mocks.getCurrentActor.mockRejectedValue(new Error("Authentification requise."));
    await expect(OperationsPage()).rejects.toThrow("REDIRECT:/auth/login");
  });

  it.each(["employee", "agency_manager", "hr_central"])("does not expose a test action to %s", async (role) => {
    mocks.getCurrentActor.mockResolvedValue({ id: "profile", role });
    render(await OperationsPage());
    expect(screen.getByRole("heading", { name: "Acces refuse" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Envoyer un test Sentry" })).toBeNull();
  });

  it("shows the audited test form to superadmins", async () => {
    mocks.getCurrentActor.mockResolvedValue({ id: "profile", role: "super_admin" });
    render(await OperationsPage());
    expect(screen.getByRole("button", { name: "Envoyer un test Sentry" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Test de supervision" })).toBeTruthy();
    expect(screen.getByText(/quinze minutes/)).toBeTruthy();
  });
});
