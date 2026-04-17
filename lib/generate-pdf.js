import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BRAND = rgb(0.106, 0.42, 0.29);   // #1B6B4A
const BLACK = rgb(0, 0, 0);
const GREY  = rgb(0.5, 0.5, 0.5);
const WARN  = rgb(0.6, 0.3, 0);         // orange for special instructions

/**
 * Generate a printer-friendly B&W production slip PDF.
 *
 * @param {{
 *   orderNumber: string,
 *   isTest: boolean,
 *   createdAt: string,
 *   customerName: string,
 *   customerEmail: string,
 *   customerPhone: string,
 *   designs: Array<{ shapeLabel: string, size: string, quantity: number, notes: string, imageUrl: string }>,
 *   shippingLabel: string,
 *   isPickup: boolean,
 *   shippingLine1?: string,
 *   shippingLine2?: string,
 *   shippingCity?: string,
 *   shippingProv?: string,
 *   shippingPostal?: string,
 *   allNotes?: string,
 * }} order
 *
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function generateProductionSlip(order) {
  const pdfDoc = await PDFDocument.create();
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const ML = 40;           // left margin
  const CWIDTH = PAGE_W - 80; // content width
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  let y = PAGE_H - 36;

  /* ── helpers ── */
  function drawText(str, { x = ML, bold = false, size = 10, color = BLACK, maxW } = {}) {
    const f = bold ? fontB : fontR;
    let s = String(str ?? '');
    if (maxW) {
      while (s.length > 3 && f.widthOfTextAtSize(s, size) > maxW) {
        s = s.slice(0, -1);
      }
      if (str.length > s.length) s = s.slice(0, -1) + '…';
    }
    page.drawText(s, { x, y, size, font: f, color });
    y -= size + 5;
  }

  function gap(n = 6) { y -= n; }

  function divider() {
    gap(4);
    page.drawLine({ start: { x: ML, y }, end: { x: PAGE_W - ML, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
    gap(8);
  }

  function sectionHeader(title) {
    gap(4);
    page.drawRectangle({ x: ML - 4, y: y - 4, width: CWIDTH + 8, height: 18, color: rgb(0.92, 0.92, 0.92) });
    drawText(title, { bold: true, size: 10 });
    gap(2);
  }

  function checkbox(label) {
    gap(4);
    page.drawRectangle({ x: ML + 4, y: y - 2, width: 12, height: 12, borderWidth: 1.2, borderColor: BLACK, color: rgb(1, 1, 1) });
    drawText(label, { x: ML + 22 });
  }

  function wrapText(str, { size = 10, color = BLACK, indent = 0, maxLineW = CWIDTH - indent - 6 } = {}) {
    const f = fontR;
    const words = String(str).split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(candidate, size) > maxLineW && line) {
        drawText(line, { x: ML + indent, size, color });
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) drawText(line, { x: ML + indent, size, color });
  }

  /* ── HEADER ── */
  page.drawRectangle({ x: 0, y: y - 32, width: PAGE_W, height: 52, color: BRAND });
  if (order.isTest) {
    page.drawRectangle({ x: 0, y: y + 18, width: PAGE_W, height: 18, color: rgb(0.96, 0.62, 0) });
    page.drawText('TEST ORDER — NOT A REAL PAYMENT', {
      x: ML, y: y + 21, size: 9, font: fontB, color: rgb(1, 1, 1),
    });
  }
  page.drawText('EDIBLEPRINT PRODUCTION SLIP', {
    x: ML, y: y + 4, size: 15, font: fontB, color: rgb(1, 1, 1),
  });
  const dateStr = new Date(order.createdAt).toLocaleString('en-US', {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' EST';
  page.drawText('Order: ' + order.orderNumber + '  |  ' + dateStr, {
    x: ML, y: y - 12, size: 9, font: fontR, color: rgb(0.8, 0.95, 0.85),
  });
  y -= 50;

  /* ── CUSTOMER ── */
  sectionHeader('CUSTOMER');
  drawText('Name:   ' + (order.customerName || '—'));
  drawText('Email:  ' + (order.customerEmail || '—'));
  drawText('Phone:  ' + (order.customerPhone || '—'));

  divider();

  /* ── PRODUCT(S) ── */
  const multi = order.designs.length > 1;
  sectionHeader(multi ? `DESIGNS  (${order.designs.length} items)` : 'PRODUCT');
  order.designs.forEach((d, i) => {
    if (multi) { gap(2); drawText(`Design ${i + 1}:`, { bold: true, size: 9 }); }
    drawText('  Shape:     ' + (d.shapeLabel || d.shape));
    drawText('  Size:      ' + (d.size || '—'));
    drawText('  Quantity:  ' + (d.quantity || 1));
    if (d.notes && d.notes !== 'None') {
      drawText('  Notes:     ' + d.notes.slice(0, 80), { color: WARN });
    }
  });

  divider();

  /* ── SHIPPING ── */
  sectionHeader('SHIPPING');
  drawText('Method: ' + (order.shippingLabel || '—'));
  if (order.isPickup) {
    drawText('PICKUP — South London, ON (Glen Cairn / Westmount area)', { color: rgb(0.1, 0.4, 0.8) });
    drawText('Confirm exact pickup time by email.', { size: 9, color: GREY });
  } else if (order.shippingLine1) {
    drawText(order.shippingLine1);
    if (order.shippingLine2) drawText(order.shippingLine2);
    drawText(`${order.shippingCity || ''}, ${order.shippingProv || ''} ${order.shippingPostal || ''}`);
  }

  divider();

  /* ── SPECIAL INSTRUCTIONS ── */
  sectionHeader('SPECIAL INSTRUCTIONS');
  if (order.allNotes && order.allNotes !== 'None') {
    page.drawRectangle({ x: ML - 4, y: y - 6, width: CWIDTH + 8, height: Math.max(28, 14 * Math.ceil(order.allNotes.length / 80) + 12), color: rgb(1, 0.97, 0.9) });
    wrapText(order.allNotes, { color: WARN });
  } else {
    drawText('None', { color: GREY });
  }

  divider();

  /* ── PRODUCTION CHECKLIST ── */
  sectionHeader('PRODUCTION CHECKLIST');
  checkbox('File downloaded');
  checkbox('Printed');
  checkbox('QC passed — colour & sharpness OK');
  checkbox('Packed in 9×12 protective mailer');
  checkbox(order.isPickup ? 'Ready for pickup — notify customer' : 'Shipped via Canada Post — enter tracking #');

  divider();

  /* ── ASSET LINKS ── */
  sectionHeader('ASSET LINKS');
  order.designs.forEach((d, i) => {
    if (!d.imageUrl || d.imageUrl === 'No image') return;
    const label = multi ? `Design ${i + 1}` : 'Final Print';
    drawText(label + ':', { bold: true, size: 9 });
    const url = d.imageUrl;
    const chunkSize = 90;
    for (let j = 0; j < url.length; j += chunkSize) {
      drawText(url.slice(j, j + chunkSize), { x: ML + 8, size: 7.5, color: rgb(0.1, 0.2, 0.8) });
    }
    gap(2);
  });

  /* ── FOOTER ── */
  page.drawLine({
    start: { x: ML, y: 36 }, end: { x: PAGE_W - ML, y: 36 },
    thickness: 0.5, color: GREY,
  });
  page.drawText(
    'EdiblePrint.net — London, ON, Canada  |  glenj.belmar@gmail.com  |  Generated: ' + dateStr,
    { x: ML, y: 22, size: 7, font: fontR, color: GREY },
  );

  return pdfDoc.save(); // Uint8Array
}
