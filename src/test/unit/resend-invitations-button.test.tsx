import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("renders both actions disabled until browser handlers are attached", () => {
    const markup = renderToString(<><PublishImportButton importId="import-1" /><ResendInvitationsButton importId="import-1" /></>);
    const container = document.createElement("div");
    container.innerHTML = markup;
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button.disabled).toBe(true));
  });

  it("enables publication in the browser and submits the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Publication refusée." } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PublishImportButton importId="import-1" />);
    const button = screen.getByRole("button", { name: "Publier" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Publication refusée."));
    expect(fetchMock).toHaveBeenCalledWith("/api/imports/import-1/publish", { method: "POST" });
  });
});
