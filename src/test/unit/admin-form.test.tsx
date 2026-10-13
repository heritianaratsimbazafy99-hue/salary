import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminForm } from "@/lib/admin/AdminForm";

afterEach(cleanup);

it("retains an edited assignment across successive server action submissions", async () => {
  const action = vi.fn<(data: FormData) => Promise<{ success: string }>>(async () => ({ success: "Enregistré" }));
  render(<AdminForm action={action} label="Modifier">
    <select aria-label="Agence" name="agencyId" defaultValue="old"><option value="old">Ancienne</option><option value="new">Nouvelle</option></select>
    <input aria-label="Actif" name="isActive" type="checkbox" defaultChecked />
    <button type="submit">Enregistrer</button>
  </AdminForm>);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "new" } });
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Enregistré"));
  expect(screen.getByRole("combobox")).toHaveValue("new");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1][0].get("agencyId")).toBe("new");
  expect(action.mock.calls[1][0].get("isActive")).toBeNull();
});
