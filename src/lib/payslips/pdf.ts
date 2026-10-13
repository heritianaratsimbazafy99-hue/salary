import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { EmployeePayslip } from "./employee";
import { toPayslipDocumentModel } from "./document-model";

export class PdfExportError extends Error {}

const money = (value: number) => {
  if (!Number.isFinite(value)) throw new PdfExportError("Montant de fiche invalide.");
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/[\u202f\u00a0]/g, " ");
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  if (text.length > 20000) throw new PdfExportError("Une rubrique est trop longue pour le PDF. Utilisez le format CSV.");
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const character of paragraph.replace(/\t/g, "    ")) {
      try {
        if (font.widthOfTextAtSize(line + character, size) > width && line) {
          lines.push(line);
          line = "";
        }
        font.encodeText(character);
      } catch {
        throw new PdfExportError("Un caractère de cette fiche n’est pas pris en charge en PDF. Utilisez le format CSV.");
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderEmployeePayslipPdf(payslip: EmployeePayslip): Promise<Uint8Array> {
  return renderPayslipsPdf([payslip]);
}

export async function renderPayslipsPdf(payslips: EmployeePayslip[]): Promise<Uint8Array> {
  if (!payslips.length || payslips.length > 100) throw new PdfExportError("Sélectionnez entre 1 et 100 fiches pour le PDF.");
  const document = await PDFDocument.create();
  document.setTitle("Fiches de paie internes");
  document.setCreator("Salary");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595.28, 841.89]);
  let y = 790;
  let first = true;
  const addPage = () => { if (document.getPageCount() >= 500) throw new PdfExportError("Document trop volumineux. Réduisez la sélection."); page = document.addPage([595.28, 841.89]); y = 790; };
  const write = (text: string, size = 10, strong = false) => {
    const font = strong ? bold : regular;
    const lines = wrap(text, font, size, 491);
    for (const line of lines) {
      if (y < 75) addPage();
      page.drawText(line, { x: 52, y, size, font, color: rgb(0.12, 0.18, 0.23) });
      y -= size + 6;
    }
  };
  for (const payslip of payslips) {
    const model = toPayslipDocumentModel(payslip);
    if (!first) addPage();
    first = false;
    write(model.companyLabel, 20, true);
    write("Document interne - ne constitue pas un bulletin légal", 9);
    y -= 16;
    write(model.employeeName, 15, true);
    write(`Période : ${model.periodStart} au ${model.periodEnd}`);
    write(`Publication : ${model.publishedAt}`);
    write("Montants en ariary (MGA)", 9);
    write(`Référence : ${model.id}`, 8);
    y -= 18;
    write(`Brut : ${money(model.grossAmount)}`, 12, true);
    write(`Retenues : ${money(model.deductionsTotal)}`, 12);
    write(`Net : ${money(model.netAmount)}`, 15, true);
    y -= 20;
    write("Détail des rubriques", 13, true);
    if (!model.payItems.length) write("Aucune rubrique détaillée.");
    for (const item of model.payItems) {
      write(`${item.label} (${item.category})`, 10, true);
      write("amount" in item ? money(item.amount) : item.text);
      y -= 5;
    }
  }
  const pages = document.getPages();
  pages.forEach((item, index) => item.drawText(`Usage interne | ${index + 1} / ${pages.length}`, { x: 52, y: 35, size: 8, font: regular, color: rgb(0.4, 0.45, 0.5) }));
  if (pages.length > 500) throw new PdfExportError("Document trop volumineux. Réduisez la sélection.");
  return document.save();
}
