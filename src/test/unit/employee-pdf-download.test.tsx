import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DownloadPayslipPdfButton } from "@/components/payslips/DownloadPayslipPdfButton";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows PDF errors inline and allows retry without leaving the payslip", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Caractère non pris en charge. Utilisez le format CSV." } }) });
  vi.stubGlobal("fetch", fetch);
  render(<DownloadPayslipPdfButton payslipId="published-id" />);
  fireEvent.click(screen.getByRole("link", { name: "Télécharger PDF" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Utilisez le format CSV"));
  expect(screen.getByRole("link", { name: "Télécharger PDF" })).toHaveAttribute("aria-disabled", "false");
  fireEvent.click(screen.getByRole("link", { name: "Télécharger PDF" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch).toHaveBeenCalledWith("/api/employee/payslips/published-id/pdf", { cache: "no-store" });
});
