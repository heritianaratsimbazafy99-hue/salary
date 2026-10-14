import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ImportReport } from "@/components/imports/ImportReport";

afterEach(cleanup);

describe("ImportReport quality", () => {
  it("counts valid rows for new employees once", () => {
    render(<ImportReport validRowCount={3} invalidRowCount={0} unknownEmployeeCount={3} errors={[]} />);
    expect(screen.getByRole("img", { name: "100 % des lignes sont valides." })).toBeTruthy();
    expect(screen.getByText("Toutes les lignes sont exploitables.")).toBeTruthy();
  });

  it("uses invalid rows, not new employees, to calculate the rejected share", () => {
    render(<ImportReport validRowCount={3} invalidRowCount={1} unknownEmployeeCount={2}
      errors={[{ rowNumber: 5, fieldName: "netPay", message: "Montant invalide" }]} />);
    expect(screen.getByRole("img", { name: "75 % des lignes sont valides." })).toBeTruthy();
    expect(screen.getByText("Seules les lignes valides seront publiées.")).toBeTruthy();
    expect(screen.getByText("Montant invalide")).toBeTruthy();
  });

  it("handles an empty import without a non-finite percentage", () => {
    render(<ImportReport validRowCount={0} invalidRowCount={0} unknownEmployeeCount={0} errors={[]} />);
    expect(screen.getByRole("img", { name: "0 % des lignes sont valides." })).toBeTruthy();
    expect(screen.getByText("Aucune ligne analysée pour le moment.")).toBeTruthy();
  });
});
