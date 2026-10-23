import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportDownload } from "@/components/exports/ExportDownload";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("export download controls", () => {
  it("keeps server-rendered exports disabled until their handlers are hydrated", () => {
    const serverMarkup = document.createElement("div");
    serverMarkup.innerHTML = renderToStaticMarkup(<ExportDownload agencyId="agency" importId="import" />);
    const buttons = [...serverMarkup.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.disabled)).toBe(true);
    render(<ExportDownload agencyId="agency" importId="import" />);
    expect(screen.getByRole("button", { name: "Télécharger XLSX" })).toBeEnabled();
  });
  it("limits manager actions to CSV and Excel", () => {
    render(<ExportDownload agencyId="agency" importId="import" />);
    expect(screen.getByRole("button", { name: "Télécharger CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger XLSX" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Télécharger PDF" })).not.toBeInTheDocument();
  });
  it("shows server errors and permits retry after a failed PDF", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Aucune fiche publiée dans cette sélection." } }) });
    vi.stubGlobal("fetch", fetch);
    render(<ExportDownload exportType="PUBLISHED_PAYSLIPS" periodStart="2026-06-01" allowPdf />);
    fireEvent.click(screen.getByRole("button", { name: "Télécharger PDF" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aucune fiche publiée"));
    expect(screen.getByRole("button", { name: "Télécharger PDF" })).toBeEnabled();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ exportType: "PUBLISHED_PAYSLIPS", format: "pdf", periodStart: "2026-06-01" });
  });
});
