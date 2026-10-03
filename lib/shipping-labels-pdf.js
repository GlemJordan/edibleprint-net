// Draws the shipping labels described by lib/shipping-labels.js into a Letter
// PDF: full-width 8.5" × 2.75" strips stacked from the top of each page, a
// dashed cut line under each one, return address on the left, destination on
// the right. Server-side only (pdf-lib), no I/O.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  LABEL_STRIP_IN, LABEL_NOTE, planLabelSheets, returnAddressLines, labelReference,
} from './shipping-labels.js';

const IN = 72;
const PAGE_W = 8.5 * IN;
const PAGE_H = 11 * IN;
const STRIP = LABEL_STRIP_IN * IN;
// Kept inside what home printers can actually print: 0.25" at the sides,
// 0.2" above and below the box within each strip.
const INSET_Y = 0.2 * IN;
const X0 = 0.25 * IN;
const X1 = PAGE_W - 0.25 * IN;

const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.72, 0.72, 0.75);

// Return address column, divider, destination column.
const FROM_X = X0 + 12;
const SEP_X = X0 + 190;
const TO_X = X0 + 213;
const TO_W = X1 - 10 - TO_X;

// Canada Post wants address characters 2–5 mm tall. Helvetica capitals are
// 0.718 of the font size: 13 pt ≈ 3.3 mm, 9.5 pt ≈ 2.4 mm, and the 8.5 pt
// floor a very long address can shrink to is still ≈ 2.15 mm.
const TO_SIZE = 13;
const TO_MIN_SIZE = 8.5;
const FROM_SIZE = 9.5;

/**
 * Keeps only characters the standard Helvetica (WinAnsi) can draw: accented
 * Latin letters survive as they are; anything else falls back to its
 * unaccented letter, or is dropped, rather than failing the whole PDF.
 */
// Latin letters that don't decompose into a base letter + accent.
const LETTER_FALLBACKS = { Ł: 'L', ł: 'l', Ø: 'O', ø: 'o', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i', ẞ: 'SS' };

function drawable(font, text) {
  const ok = new Set(font.getCharacterSet());
  let out = '';
  for (const ch of String(text)) {
    if (ok.has(ch.codePointAt(0))) { out += ch; continue; }
    const base = LETTER_FALLBACKS[ch] || ch.normalize('NFD')[0];
    if (base && [...base].every((b) => ok.has(b.codePointAt(0)))) out += base;
  }
  return out;
}

/** One size for the whole destination block (Canada Post: same font throughout), shrunk only as far as the longest line needs. */
function blockSize(font, lines, maxWidth) {
  let size = TO_SIZE;
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, TO_SIZE);
    if (w > maxWidth) size = Math.min(size, TO_SIZE * maxWidth / w);
  }
  return Math.max(TO_MIN_SIZE, Math.floor(size * 4) / 4);
}

function roundedRectPath(w, h, r) {
  // SVG path, y pointing down from the top-left corner (pdf-lib's drawSvgPath convention).
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} `
    + `H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function drawScissors(page, x, y) {
  const opts = { borderColor: MUTED, borderWidth: 0.8 };
  page.drawCircle({ x: x + 2, y: y + 2.6, size: 1.9, ...opts });
  page.drawCircle({ x: x + 2, y: y - 2.6, size: 1.9, ...opts });
  page.drawLine({ start: { x: x + 3.6, y: y + 1.6 }, end: { x: x + 12, y: y - 1.2 }, thickness: 0.8, color: MUTED });
  page.drawLine({ start: { x: x + 3.6, y: y - 1.6 }, end: { x: x + 12, y: y + 1.2 }, thickness: 0.8, color: MUTED });
}

function drawLabel(page, fonts, label, slot, fromLines) {
  const { regular, bold } = fonts;
  const top = PAGE_H - slot * STRIP;
  const bt = top - INSET_Y;
  const bb = top - STRIP + INSET_Y;

  page.drawSvgPath(roundedRectPath(X1 - X0, bt - bb, 7), { x: X0, y: bt, borderColor: INK, borderWidth: 1.2 });
  page.drawLine({ start: { x: SEP_X, y: bb + 12 }, end: { x: SEP_X, y: bt - 12 }, thickness: 0.6, color: RULE });

  // Return address — top left, smaller than the destination.
  page.drawText('FROM / DE', { x: FROM_X, y: bt - 15, size: 7, font: bold, color: MUTED });
  fromLines.forEach((line, i) => {
    page.drawText(drawable(regular, line), { x: FROM_X, y: bt - 30 - i * 13, size: FROM_SIZE, font: regular, color: INK });
  });

  // Handling note and order reference — bottom left, outside the address blocks.
  page.drawText(LABEL_NOTE, { x: FROM_X, y: bb + 23, size: 9, font: bold, color: INK });
  page.drawText(drawable(regular, labelReference(label)), { x: FROM_X, y: bb + 10, size: 7, font: regular, color: MUTED });

  // Destination.
  page.drawText('TO / À', { x: TO_X, y: bt - 16, size: 9, font: bold, color: INK });
  const lines = label.lines.map((l) => drawable(bold, l));
  const size = blockSize(bold, lines, TO_W);
  const firstBaseline = bt - 25 - size;
  const room = firstBaseline - (bb + 8);
  const pitch = lines.length > 1 ? Math.min(size * 1.45, room / (lines.length - 1)) : 0;
  lines.forEach((line, i) => {
    page.drawText(line, { x: TO_X, y: firstBaseline - i * pitch, size, font: bold, color: rgb(0, 0, 0) });
  });

  // Cut line along the bottom of the strip (none at the paper's own edge).
  const cutY = top - STRIP;
  if (cutY > 1) {
    page.drawLine({ start: { x: X0 + 15, y: cutY }, end: { x: X1, y: cutY }, thickness: 0.6, color: MUTED, dashArray: [4, 3] });
    drawScissors(page, X0 + 1, cutY);
  }
}

/**
 * @param {ReturnType<import('./shipping-labels.js').expandLabels>} labels  one per package, in print order
 * @param {{ firstSheetFree?: number }} [opts]  free spaces on the sheet already in the printer (4, 3 or 2)
 * @returns {Promise<Uint8Array>}
 */
export async function generateShippingLabelsPdf(labels, { firstSheetFree } = {}) {
  if (!Array.isArray(labels) || labels.length === 0) throw new Error('generateShippingLabelsPdf: no labels to print');

  const doc = await PDFDocument.create();
  doc.setTitle('EdiblePrint shipping labels');
  doc.setSubject(`${labels.length} Canada Post label${labels.length === 1 ? '' : 's'} — 8.5 x 2.75 in, printed from the top of a Letter sheet`);
  doc.setCreator('edibleprint.net admin');
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const fromLines = returnAddressLines();

  const { pages } = planLabelSheets(labels.length, firstSheetFree);
  let next = 0;
  for (const count of pages) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    for (let slot = 0; slot < count; slot++) drawLabel(page, fonts, labels[next++], slot, fromLines);
  }
  return doc.save();
}
