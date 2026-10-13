import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ManualCorrectionSchema, PublicationConfirmationSchema } from "@/lib/payroll/manager-review";
import { PayslipPreviewTable } from "@/components/imports/PayslipPreviewTable";
import { InvitationConfirmation } from "@/components/imports/InvitationConfirmation";
afterEach(cleanup);
describe("manager publication safety", () => {
  it.each([{}, { confirmed: false, fingerprint: "a".repeat(32) }, { confirmed: true }, { confirmed: true, fingerprint: "abc" }, { confirmed: true, fingerprint: "a".repeat(32), employeeIds: [] }])("rejects incomplete or forged confirmation %j", (body) => { expect(PublicationConfirmationSchema.safeParse(body).success).toBe(false); });
  it.each([{ employeeId: "OTHER" }, { email: "other@example.com" }, { grossAmount: -1 }, { netAmount: Infinity }, { netAmount: "12" }, { status: "PUBLISHED" }, {}, { notes: "x".repeat(1001) }])("rejects invalid correction %j", (changes) => { expect(ManualCorrectionSchema.safeParse({ expectedUpdatedAt: "2026-10-13T10:00:00Z", reason: "Erreur de saisie", changes }).success).toBe(false); });
  it("requires a revision and meaningful audit reason", () => { expect(ManualCorrectionSchema.safeParse({ changes: { netAmount: 4 }, reason: "ok" }).success).toBe(false); });
  it("allows valid monetary correction with negative net and a reason", () => { expect(ManualCorrectionSchema.safeParse({ expectedUpdatedAt: "2026-10-13T10:00:00+00:00", reason: "Erreur de saisie", changes: { grossAmount: 12, deductionsTotal: 15, netAmount: -3 } }).success).toBe(true); });
  it("lets managers inspect row 101 without a hidden truncation", () => {
    render(<PayslipPreviewTable rows={Array.from({ length: 101 }, (_, i) => ({ id: String(i), employeeId: `EMP-${i}`, employeeName: `Salarié ${i}`, grossAmount: 100, deductionsTotal: 10, netAmount: 90, hasManualAdjustments: false }))} />);
    expect(screen.queryByText("Salarié 100")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Suivant" })); fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByText("Salarié 100")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("makes every recipient address accessible, including number 101", () => {
    render(<InvitationConfirmation candidates={Array.from({ length: 101 }, (_, i) => ({ employeeId: String(i), employeeName: `Salarié ${i}`, email: `employee${i}@example.com` }))} />);
    fireEvent.click(screen.getByRole("button", { name: "Destinataires suivants" })); fireEvent.click(screen.getByRole("button", { name: "Destinataires suivants" }));
    expect(screen.getByText("employee100@example.com")).toBeTruthy();
  });
});
