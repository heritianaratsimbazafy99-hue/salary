import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PublishImportButton } from "@/components/imports/PublishImportButton";
import { ResendInvitationsButton } from "@/components/imports/ResendInvitationsButton";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ResendInvitationsButton", () => {
  it("sends only a scoped import request and presents the delivery summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { sent: 2, failed: 0, skipped: 1 } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ResendInvitationsButton importId="import-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer les invitations" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 invitation(s) envoyée(s)"));
    expect(fetchMock).toHaveBeenCalledWith("/api/imports/import-1/invitations", { method: "POST" });
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("announces delivery failures and allows retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { sent: 0, failed: 1, skipped: 0 } }) }));
    render(<ResendInvitationsButton importId="import-1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("1 échec(s)"));
    expect(screen.getByRole("button")).toBeEnabled();
  });
});

describe("import action hydration", () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  beforeAll(() => {
    // jsdom has no native dialog opening; retain the real component and UI events.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
    });
  });
  afterAll(() => {
    if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  });
  it("renders both actions disabled until browser handlers are attached", () => {
    const markup = renderToString(<><PublishImportButton importId="import-1" /><ResendInvitationsButton importId="import-1" /></>);
    const container = document.createElement("div");
    container.innerHTML = markup;
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button.disabled).toBe(true));
  });

  it("enables review in the browser and announces a rejected review without publishing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Publication refusée." } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublishImportButton importId="import-1" />);
    const button = screen.getByRole("button", { name: "Publier" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Publication refusée."));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/imports/import-1/review", { cache: "no-store" });
    expect(button).toBeEnabled();
  });

  it("requires explicit confirmation and sends the reviewed fingerprint, then rejects stale review", async () => {
    const fingerprint = "a".repeat(32);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {
        fingerprint, recipients: [{ employeeId: "EMP-1", employeeName: "Employee One", email: "one@example.com" }],
      } }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { message: "Revue périmée." } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublishImportButton importId="import-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    await screen.findByRole("dialog", { name: "Vérifier avant publication" });
    expect(screen.getByText("one@example.com")).toBeVisible();
    const confirmation = screen.getByRole("button", { name: "Confirmer la publication" });
    expect(confirmation).toBeDisabled();
    fireEvent.click(confirmation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmation).toBeEnabled();
    fireEvent.click(confirmation);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Revue périmée."));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/imports/import-1/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, fingerprint }),
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled();
  });

  it("cancels a review without publishing and requires confirmation again on reopening", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
      fingerprint: "b".repeat(32), recipients: [{ employeeId: "EMP-1", employeeName: "Employee One", email: "one@example.com" }],
    } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublishImportButton importId="import-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmer la publication" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => options.cache === "no-store")).toBe(true);
  });
});
