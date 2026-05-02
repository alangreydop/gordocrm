import { PDFDocument, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { schema } from '../../db/index.js';

type InvoiceRecord = typeof schema.invoices.$inferSelect;
type InvoiceItemRecord = typeof schema.invoiceItems.$inferSelect;

const A4: [number, number] = [595.28, 841.89];
const LOGO_URL = 'https://logos.grandeandgordo.com/logoggblanco.png';
const black = rgb(0, 0, 0);
const dark = rgb(0.08, 0.08, 0.08);
const gray = rgb(0.55, 0.55, 0.55);
const lightGray = rgb(0.68, 0.68, 0.68);
const white = rgb(1, 1, 1);

export async function generateInvoicePdfBytes(
  invoice: InvoiceRecord,
  items: InvoiceItemRecord[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);

  let page = pdf.addPage(A4);
  drawFirstPageHeader(page, invoice, regular, bold, logo);

  let rowY = drawTableHeader(page, 488, regular);
  for (const item of items) {
    const rowHeight = measureItemRow(item, regular, 270);
    if (rowY - rowHeight < 160) {
      page = pdf.addPage(A4);
      rowY = drawTableHeader(page, 760, regular);
    }

    rowY = drawItemRow(page, item, rowY, rowHeight, regular);
  }

  if (rowY < 175) {
    page = pdf.addPage(A4);
  }

  drawTotals(page, invoice, regular, bold);
  drawPaymentPage(pdf, invoice, regular, bold);

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: 54,
      y: 26,
      size: 9,
      font: regular,
      color: lightGray,
    });
  });

  return pdf.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export function invoicePdfFilename(invoiceNumber: string): string {
  const safeInvoiceNumber = invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `factura-${safeInvoiceNumber}.pdf`;
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;

    return await pdf.embedPng(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function drawFirstPageHeader(
  page: PDFPage,
  invoice: InvoiceRecord,
  regular: PDFFont,
  bold: PDFFont,
  logo: PDFImage | null,
): void {
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = formatDate(invoice.dueDate);

  drawText(page, issueDate, 54, 785, 10, regular, lightGray);
  drawText(page, invoice.description || 'Grande&Gordo production services', 54, 771, 10, regular, lightGray, 250);
  drawText(page, `Invoice # ${invoice.invoiceNumber}`, 54, 757, 10, regular, lightGray);

  const logoBox = { x: 354, y: 746, width: 145, height: 42 };
  page.drawRectangle({ ...logoBox, color: black });
  if (logo) {
    const fitted = fitImage(logo, logoBox.width - 22, logoBox.height - 14);
    page.drawImage(logo, {
      x: logoBox.x + (logoBox.width - fitted.width) / 2,
      y: logoBox.y + (logoBox.height - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
  } else {
    drawCenteredText(page, 'GRANDE&GORDO', logoBox.x + logoBox.width / 2, logoBox.y + 16, 11, bold, white);
  }

  const issuerLines = [
    { value: invoice.issuerLegalName, font: bold, size: 10 },
    { value: invoice.issuerTaxId, font: bold, size: 9 },
    { value: invoice.issuerAddressLine1, font: regular, size: 9 },
    { value: `${invoice.issuerPostalCode} ${invoice.issuerCity}, ${invoice.issuerCountry || 'ES'}`, font: regular, size: 9 },
    { value: invoice.issuerEmail, font: regular, size: 9 },
  ];
  let issuerY = 708;
  for (const line of issuerLines) {
    drawCenteredText(page, line.value, 426, issuerY, line.size, line.font, gray);
    issuerY -= 12;
  }

  drawText(page, 'factura', 370, 594, 38, regular, dark);

  drawText(page, 'Billed To', 54, 630, 10, regular, lightGray);
  const billedLines = [
    `${invoice.clientLegalName} - ${invoice.clientTaxId}`,
    invoice.clientAddressLine1,
    [invoice.clientPostalCode, invoice.clientCity, invoice.clientRegion].filter(Boolean).join(' '),
    invoice.clientCountry || 'ES',
  ];
  let billedY = 615;
  for (const line of billedLines) {
    drawText(page, line, 54, billedY, 10.5, regular, dark, 270);
    billedY -= 13;
  }

  drawText(page, formatMoney(invoice.totalCents), 54, 532, 23, regular, dark);
  drawText(page, `due by ${dueDate}`, 54, 512, 10, regular, dark);
}

function drawTableHeader(page: PDFPage, y: number, regular: PDFFont): number {
  page.drawRectangle({ x: 54, y, width: 487, height: 20, color: black });
  drawText(page, 'Item', 58, y + 6, 9.5, regular, white);
  drawText(page, 'Rate / Price', 386, y + 6, 9.5, regular, white);
  drawText(page, 'Subtotal', 481, y + 6, 9.5, regular, white);
  return y - 23;
}

function measureItemRow(item: InvoiceItemRecord, regular: PDFFont, maxWidth: number): number {
  const lines = wrapText(item.description, regular, 10, maxWidth);
  return Math.max(26, lines.length * 12 + 10);
}

function drawItemRow(
  page: PDFPage,
  item: InvoiceItemRecord,
  y: number,
  rowHeight: number,
  regular: PDFFont,
): number {
  const lines = wrapText(item.description, regular, 10, 270);
  let lineY = y - 2;
  for (const line of lines) {
    drawText(page, line, 58, lineY, 10, regular, dark);
    lineY -= 12;
  }

  drawText(page, formatRate(item), 392, y - 2, 10, regular, dark);
  drawText(page, formatMoney(item.subtotalCents), 486, y - 2, 10, regular, dark);

  return y - rowHeight;
}

function drawTotals(page: PDFPage, invoice: InvoiceRecord, regular: PDFFont, bold: PDFFont): void {
  const dueDate = formatDate(invoice.dueDate);

  page.drawLine({ start: { x: 54, y: 130 }, end: { x: 541, y: 130 }, thickness: 0.8, color: black });
  page.drawLine({ start: { x: 454, y: 58 }, end: { x: 454, y: 130 }, thickness: 0.8, color: black });

  drawRightText(page, 'Subtotal', 448, 113, 9.5, regular, dark);
  drawRightText(page, formatMoney(invoice.subtotalCents), 518, 113, 9.5, regular, dark);
  drawRightText(page, `IVA ${Math.round((invoice.taxRate ?? 0.21) * 100)}%`, 448, 93, 9.5, regular, dark);
  drawRightText(page, formatMoney(invoice.taxAmountCents), 518, 93, 9.5, regular, dark);

  if (invoice.irpfAmountCents) {
    drawRightText(page, 'IRPF', 448, 73, 9.5, regular, dark);
    drawRightText(page, `-${formatMoney(invoice.irpfAmountCents)}`, 518, 73, 9.5, regular, dark);
  }

  page.drawRectangle({ x: 54, y: 58, width: 487, height: 22, color: black });
  page.drawLine({ start: { x: 454, y: 58 }, end: { x: 454, y: 80 }, thickness: 0.8, color: white });
  drawRightText(page, `Total due by ${dueDate}`, 448, 65.5, 9.5, regular, white);
  drawRightText(page, formatMoney(invoice.totalCents), 518, 65.5, 10, bold, white);
}

function drawPaymentPage(pdf: PDFDocument, invoice: InvoiceRecord, regular: PDFFont, bold: PDFFont): void {
  const page = pdf.addPage(A4);
  drawText(page, 'payment method', 54, 716, 10, regular, gray);
  drawText(page, `The total of your invoice is: ${formatMoney(invoice.totalCents)}`, 54, 680, 10, regular, dark);
  drawText(page, 'Please pay directly using the following banking information:', 54, 662, 10, regular, dark);

  const paymentLines = wrapText(
    invoice.paymentNotes || 'Payment details pending configuration.',
    regular,
    10,
    430,
  );

  let y = 636;
  for (const line of paymentLines) {
    drawText(page, line, 54, y, 10, line.includes(':') ? bold : regular, dark);
    y -= 15;
  }
}

function formatRate(item: InvoiceItemRecord): string {
  if (item.quantity === 1) return formatMoney(item.unitPriceCents);
  return `${formatQuantity(item.quantity)} x ${formatMoney(item.unitPriceCents)}`;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toLocaleString('es-ES');
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function drawText(
  page: PDFPage,
  value: unknown,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = dark,
  maxWidth?: number,
): void {
  const text = textForPdf(value);
  if (!text) return;

  const lines = maxWidth ? wrapText(text, font, size, maxWidth) : [text];
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + 3),
      size,
      font,
      color,
    });
  });
}

function drawCenteredText(
  page: PDFPage,
  value: unknown,
  centerX: number,
  y: number,
  size: number,
  font: PDFFont,
  color = dark,
): void {
  const text = textForPdf(value);
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, centerX - width / 2, y, size, font, color);
}

function drawRightText(
  page: PDFPage,
  value: unknown,
  rightX: number,
  y: number,
  size: number,
  font: PDFFont,
  color = dark,
): void {
  const text = textForPdf(value);
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, rightX - width, y, size, font, color);
}

function wrapText(value: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = textForPdf(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function fitImage(image: PDFImage, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  return {
    width: image.width * ratio,
    height: image.height * ratio,
  };
}

function textForPdf(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
