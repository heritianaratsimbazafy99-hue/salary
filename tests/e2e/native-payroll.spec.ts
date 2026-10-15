import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import * as XLSX from "xlsx";
import {
  acceptEmployeeInvitationForE2E,
  appUrl,
  createPayrollE2EFixture,
  signInAsE2EUser,
} from "./helpers/supabase-fixtures";

for (const format of ["airtel", "huawei"] as const) {
  test(`${format} native workbook publishes to the existing employee space and PDF`, async ({ page }) => {
    test.setTimeout(150_000);
    const fixture = await createPayrollE2EFixture();
    const employeeName = `Synthetic ${format} Employee`;
    const employeeId = `NATIVE-${fixture.suffix.slice(-6).toUpperCase()}`;
    const net = format === "airtel" ? 1_121_000 : 1_141_000;
    const detailLabel = format === "airtel" ? "BONUS" : "TRANSPORT ALLOWANCE";
    const quantityLabel = format === "airtel" ? "JOURS TRAVAILLES" : "DAYS WORKED";

    try {
      const employee = await fixture.admin.from("employees").insert({
        agency_id: fixture.agencyId, employee_id: employeeId,
        email: fixture.employeeEmail, full_name: employeeName,
      }).select("id,profile_id").single();
      expect(employee.error).toBeNull();
      expect(employee.data?.profile_id).toBeNull();

      // No email column: only this agency's exact canonical matricule can resolve the recipient.
      const row: Record<string, string | number> = format === "airtel" ? {
        NAME: employeeName, MATRICULE: ` ${employeeId.toLowerCase()} `,
        "SALAIRE DE BASE": 1_000_000, "SALAIRE BRUT": 1_200_000, "SALAIRE NET": net,
        "CNAPS 1%": 12_000, "OSTIE 1%": 12_000, IRSA: 30_000, "DEDUCTION AVANCE": 25_000,
        BONUS: 200_000, "JOURS TRAVAILLES": 22,
      } : {
        ID: ` ${employeeId.toLowerCase()} `, "HRMS OFFICAL NAME": employeeName,
        "ACTUAL BASIC SALARY": 1_000_000, "TOTAL OF GROSS SALARY": 1_200_000,
        "NET PAY": 1_121_000, NP2: net, "CNAPS Employee 1%": 12_000,
        "OSTIE Employee 1%": 12_000, "Individual Income Tax IRSA": 30_000,
        "CASH ADVANCE": 25_000, "TRANSPORT ALLOWANCE": 200_000, "DAYS WORKED": 22,
      };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ["SYNTHETIC PAYROLL JUNE 2026"], [], [], Object.keys(row), Object.values(row),
      ]), format === "airtel" ? "Recap global" : "JUNE");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: format === "airtel" ? "xlsx" : "biff8" }) as Buffer;
      if (format === "huawei") expect(buffer.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1");

      await signInAsE2EUser(page, {
        email: fixture.manager.email, password: fixture.password,
        targetPath: "/manager/imports", expectedPath: /\/manager\/imports$/,
      });
      await page.getByLabel("Debut de periode").fill(fixture.periodStart);
      await page.getByLabel("Fin de periode").fill(fixture.periodEnd);
      await page.getByLabel("Fichier Excel").setInputFiles({
        name: `synthetic-${format}.${format === "airtel" ? "xlsx" : "xls"}`,
        mimeType: format === "airtel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel",
        buffer,
      });
      await page.getByRole("button", { name: "Importer", exact: true }).click();
      await page.waitForURL(/\/manager\/imports\/[0-9a-f-]+$/);
      const importId = page.url().split("/").at(-1)!;
      await expect(page.getByLabel("100 % des lignes sont valides.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Mapping des colonnes" })).toHaveCount(0);
      const imported = await fixture.admin.from("payroll_import_rows").select("employee_id,employee_email").eq("import_id", importId);
      expect(imported.error).toBeNull();
      expect(imported.data).toEqual([{ employee_id: employeeId, employee_email: fixture.employeeEmail }]);
      const beforePublication = await fixture.admin.from("payslips").select("id").eq("agency_id", fixture.agencyId);
      expect(beforePublication.error).toBeNull();
      expect(beforePublication.data).toEqual([]);

      await page.getByRole("button", { name: "Publier", exact: true }).click();
      const review = page.getByRole("dialog", { name: "Vérifier avant publication" });
      await expect(review.getByText(fixture.employeeEmail, { exact: true })).toBeVisible();
      await expect(review.getByRole("button", { name: "Confirmer la publication", exact: true })).toBeDisabled();
      await review.getByRole("checkbox").check();
      const publication = page.waitForResponse((response) =>
        response.url().endsWith(`/api/imports/${importId}/publish`) && response.request().method() === "POST",
      );
      await review.getByRole("button", { name: "Confirmer la publication", exact: true }).click();
      expect((await publication).status()).toBe(200);

      await acceptEmployeeInvitationForE2E(fixture.admin, {
        agencyId: fixture.agencyId, employeeEmail: fixture.employeeEmail,
        fullName: employeeName, password: fixture.password,
      });
      await signInAsE2EUser(page, {
        email: fixture.employeeEmail, password: fixture.password,
        targetPath: "/employee/payslips", expectedPath: /\/employee\/payslips$/,
      });
      await expect(page.getByRole("heading", { name: "Mes fiches de paie" })).toBeVisible();
      const payslip = page.getByRole("article", { name: `Fiche de paie ${fixture.periodStart} - ${fixture.periodEnd}` });
      await expect(payslip.getByRole("heading", { name: employeeName })).toBeVisible();
      const formattedNet = new Intl.NumberFormat("fr-MG", { style: "currency", currency: "MGA", maximumFractionDigits: 0 }).format(net);
      await expect(payslip.getByText(formattedNet, { exact: true })).toBeVisible();
      await expect(payslip.getByText(detailLabel, { exact: true })).toBeVisible();
      const quantity = payslip.getByRole("listitem").filter({ has: page.getByText(quantityLabel, { exact: true }) });
      await expect(quantity.getByText("22", { exact: true })).toBeVisible();
      await expect(quantity).not.toContainText("Ar");

      const published = await fixture.admin.from("payslips").select("id,employee_id").eq("agency_id", fixture.agencyId).single();
      expect(published.error).toBeNull();
      expect(published.data?.employee_id).toBe(employee.data!.id);
      const pdf = await page.context().request.get(appUrl(`/api/employee/payslips/${published.data!.id}/pdf`));
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });
}
