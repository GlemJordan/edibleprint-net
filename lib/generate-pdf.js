import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pageSizePtForShape, computeSheetPlacement, computeMultiCircleLayout, isWholeSheetShape, sheetFormatLabel, shapeDisplayLabel } from './paper-config.js';
import { resolveMaterial, materialDisplayLabel } from './material-config.js';
import { CUT_SHAPES, resolveCut } from './cutting-config.js';
import { shapeSupportsCutGuide, cutGuideShapeKind, CUT_GUIDE_COLOR, CUT_GUIDE_PDF_STYLE } from './cut-guide-config.js';
import { shapeOutlinePath } from './shape-paths.js';
import { CATALOG_SIZES } from './catalog-sizes.js';

const BRAND = rgb(0.106, 0.42, 0.29);   // #1B6B4A
const BLACK = rgb(0, 0, 0);
const GREY  = rgb(0.5, 0.5, 0.5);
const WARN  = rgb(0.6, 0.3, 0);         // orange for special instructions

function hexToRgbColor(hex) {
  const clean = hex.replace('#', '');
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}
const CUT_GUIDE_RGB = hexToRgbColor(CUT_GUIDE_COLOR);

// An order record's design only ever kept the human-readable size LABEL
// (e.g. `6"×6" Topper (15cm)`, or `5"x7"` for Custom) — sizeId/customW/
// customH are never sent to Stripe metadata (see app/api/create-checkout/
// route.js's designMeta key-budget comment), so generatePrintPdf()'s
// sizeInches/customW/customH have to be recovered from that label here.
// Used by both the webhook/regenerate pipeline (lib/order-pdf-pipeline.js)
// and the admin "with guide"/"without guide" on-demand download (app/api/
// admin/orders/[id]/download/route.js) so the two can't recover different
// numbers from the same stored design.
export function parseDesignSizeForPdf(d) {
  const sizeInches = parseFloat(d.size) || 6;
  const customW = d.shape === 'custom' ? parseFloat(d.size.split('"x')[0]) : undefined;
  const customH = d.shape === 'custom' ? parseFloat(d.size.split('"x')[1]) : undefined;
  return { sizeInches, customW, customH };
}

// Builds the sizeObj drawCutGuideOnPage() needs, from the same plain
// `sizeInches` number every generatePrintPdf() caller already passes. For
// multicircle, that slot holds the per-circle size (2"/3" — see
// lib/order-pdf-pipeline.js and app/api/generate-pdf/route.js for why), so
// this looks up the matching catalog entry for its cols/rows/gap, keeping
// the guide grid identical to the one the customer saw rather than
// re-deriving an approximate grid from scratch.
export function cutGuideSizeObj(shape, sizeInches) {
  if (shape === 'multicircle') {
    return CATALOG_SIZES.multicircle.find((s) => s.circleSize === sizeInches) || { w: sizeInches };
  }
  return { w: sizeInches };
}

/**
 * Draws the cut guide onto a print-ready PDF page — the SAME outline
 * geometry (lib/shape-paths.js) and placement math (computeSheetPlacement/
 * computeMultiCircleLayout, lib/paper-config.js) the client canvas preview
 * uses, so the line a customer saw before buying can't differ from the one
 * that actually prints. Coordinates are built in inches (the path's own
 * local unit) with the sheet's top-left as origin, y increasing downward —
 * `scale: PT_PER_IN` plus pdf-lib's automatic SVG-Y-flip (see
 * drawSvgPath()'s own source) maps that straight onto the PDF page, whose
 * origin is bottom-left with y increasing upward.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {{shape: string, customShapeKind?: string, sizeObj: object, customW?: number, customH?: number}} params
 */
export function drawCutGuideOnPage(page, { shape, customShapeKind, sizeObj, customW, customH }) {
  const PT_PER_IN = 72;
  const { height: pageHeightPt } = page.getSize();
  const strokeOpts = {
    x: 0,
    y: pageHeightPt,
    scale: PT_PER_IN,
    borderColor: CUT_GUIDE_RGB,
    borderWidth: CUT_GUIDE_PDF_STYLE.widthPt / PT_PER_IN,
    borderDashArray: CUT_GUIDE_PDF_STYLE.dashPt.map((v) => v / PT_PER_IN),
  };

  if (shape === 'multicircle') {
    const placement = computeSheetPlacement(shape, sizeObj);
    const { circlePx: circleIn, mcCols, mcRows, mcStepPx: stepIn, mcOffsetX: offXIn, mcOffsetY: offYIn } =
      computeMultiCircleLayout(placement.sheetW, placement.sheetH, true, sizeObj);
    for (let row = 0; row < mcRows; row++) {
      for (let col = 0; col < mcCols; col++) {
        const d = shapeOutlinePath('circle', offXIn + col * stepIn, offYIn + row * stepIn, circleIn, circleIn);
        page.drawSvgPath(d, strokeOpts);
      }
    }
    return;
  }

  const placement = computeSheetPlacement(shape, sizeObj, customW, customH);
  const kind = cutGuideShapeKind(shape, customShapeKind);
  const d = shapeOutlinePath(kind, placement.offsetX, placement.offsetY, placement.designW, placement.designH);
  page.drawSvgPath(d, strokeOpts);
}

/* Fetched over HTTP (same pattern as generatePrintPdf fetching a customer's
   Cloudinary image below) rather than read off local disk — avoids relying
   on public/ being present in the serverless function's filesystem, which
   isn't guaranteed the way it is for local dev. Cached per warm instance so
   repeat slip generations in the same invocation don't re-fetch. Logo is on
   a white/light circular background (logo-full.png), so it reads fine
   against the BRAND-green header banner it's placed on below — the
   dark-green wordmark variants would be invisible there. */
let cachedLogoBytes = null;
async function getLogoBytes() {
  if (cachedLogoBytes) return cachedLogoBytes;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';
    const res = await fetch(`${baseUrl}/logo-assets/logo-full.png`);
    if (!res.ok) return null;
    cachedLogoBytes = Buffer.from(await res.arrayBuffer());
    return cachedLogoBytes;
  } catch (e) {
    console.error('[generate-pdf] logo fetch failed, continuing without it:', e.message);
    return null;
  }
}

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
 *   designs: Array<{ shape: string, shapeLabel: string, material?: 'icing'|'wafer', cutToShape?: boolean, size: string, quantity: number, notes: string, imageUrl: string }>,
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
  const logoBytes = await getLogoBytes();
  if (logoBytes) {
    try {
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const logoSize = 40;
      page.drawImage(logoImg, { x: PAGE_W - logoSize - ML, y: y - 32 + (52 - logoSize) / 2, width: logoSize, height: logoSize });
    } catch (e) {
      console.error('[generate-pdf] logo embed failed, continuing without it:', e.message);
    }
  }
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
    // Material is ALWAYS stated here, for icing too — not just a
    // conditional warning when it's wafer. Before material became a choice
    // crossing every shape, the shape name alone told you the material
    // (waferletter vs everything else); now shape and material are
    // independent, so silence can no longer be read as "it's icing" — the
    // person printing this needs the line to say so explicitly every time.
    const material = resolveMaterial(d);
    const isWafer = material === 'wafer';
    drawText('  Shape:     ' + (d.shapeLabel || d.shape));
    drawText('  Material:  ' + materialDisplayLabel(material).toUpperCase() + (isWafer ? '  — NOT ICING SHEET' : ''), { bold: true, color: isWafer ? WARN : BLACK });
    // Shown for every cut-eligible shape (round/heart/square/custom/cookie
    // sheet — see CUT_SHAPES), same "always state it, don't just warn on the
    // non-default case" treatment as Material above — a missing cut is worse
    // than a missing material note, since it means delivering something the
    // customer paid to have cut without cutting it.
    if (CUT_SHAPES.includes(d.shape)) {
      const cutToShape = resolveCut(d);
      drawText('  Cut:       ' + (cutToShape ? 'YES — CUT TO SHAPE ON PLOTTER' : 'No'), { bold: true, color: cutToShape ? WARN : BLACK });
    }
    // Cut guide (lib/cut-guide-config.js) — a printed dashed line, distinct
    // from the plotter cut above — shown for every guide-eligible shape the
    // same "always state it" way, so a missing guide the customer paid
    // attention to (or an unwanted one) is never just silently assumed.
    if (shapeSupportsCutGuide(d.shape, d.customShapeKind)) {
      const cutGuide = d.cutGuide === true;
      drawText('  Cut guide: ' + (cutGuide ? 'YES — printed on sheet' : 'No'), { bold: cutGuide, color: cutGuide ? BRAND : BLACK });
    }
    drawText('  Size:      ' + (d.size || '—'));
    drawText('  Quantity:  ' + (d.quantity || 1));
    if (d.sourceType === 'upload') {
      drawText('  [!] CUSTOMER-SUPPLIED FILE — PRINT AS-IS, NO ADJUSTMENTS', { bold: true, color: WARN });
      if (d.pageCount > 1) {
        drawText('    Print page ' + d.selectedPage + ' of ' + d.pageCount + ' only', { bold: true, color: WARN });
      }
      drawText('    Verify text/fonts render correctly before printing.', { size: 9, color: WARN });
    }
    if (d.catalogDesignId) {
      drawText('  [CATALOG DESIGN] ' + d.catalogDesignId, { bold: true });
      if (d.customText) drawText('    Text: "' + d.customText.slice(0, 80) + '"', { bold: true });
    }
    if (d.notes && d.notes !== 'None') {
      drawText('  Notes:     ' + d.notes.slice(0, 80), { color: WARN });
    }
  });

  divider();

  /* ── SHIPPING ── */
  sectionHeader('SHIPPING');
  drawText('Method: ' + (order.shippingLabel || '—'));
  if (order.isPickup) {
    drawText('PICKUP — East London, ON', { color: rgb(0.1, 0.4, 0.8) });
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
  if (order.designs.some(d => resolveMaterial(d) === 'wafer')) {
    checkbox('[!] WAFER PAPER STOCK LOADED (confirm — not icing sheet)');
  }
  if (order.designs.some(d => resolveCut(d))) {
    checkbox('[!] CUT TO SHAPE ON PLOTTER (confirm before packing)');
  }
  if (order.designs.some(d => d.sourceType === 'upload')) {
    checkbox('[!] CUSTOMER-SUPPLIED FILE — printing exactly as provided, no edits made');
  }
  checkbox('File downloaded');
  checkbox('Printed');
  checkbox('QC passed — colour & sharpness OK');
  checkbox('Packed in 9×12 protective mailer');
  checkbox(order.isPickup ? 'Ready for pickup — notify customer' : 'Shipped via Canada Post Lettermail');

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
    'EdiblePrint.net — London, ON, Canada  |  edibleprintorders@gmail.com  |  Generated: ' + dateStr,
    { x: ML, y: 22, size: 7, font: fontR, color: GREY },
  );

  return pdfDoc.save(); // Uint8Array
}

/**
 * Generate a print-ready PDF from a Cloudinary image URL. Page size is A4
 * for every catalog shape — icing sheets and wafer paper alike
 * (lib/paper-config.js); image is placed at its physical print
 * position/size via computeSheetPlacement(), the same function the
 * print-preview modal uses. Layout otherwise identical to
 * app/api/generate-pdf/route.js.
 *
 * @param {{
 *   imageUrl:   string,   // Cloudinary https URL — always the CLEAN base
 *                         // asset; the cut guide (if any) is drawn here as
 *                         // a vector overlay, never baked into this image.
 *   shape:      string,   // 'fullsheet'|'bwsheet'|'multicircle'|'waferletter'|'circular'|'heart'|'square'|'custom'
 *   material?:  'icing'|'wafer', // resolveMaterial() already applied by the caller
 *   sizeInches: number,   // used for circular/heart/square; for multicircle,
 *                         // the per-circle size (2/3") — see the caller
 *                         // (lib/order-pdf-pipeline.js) for why that's what
 *                         // ends up in this slot for that shape.
 *   customW?:   number,   // used when shape === 'custom'
 *   customH?:   number,
 *   cutGuide?:  boolean,  // draw the dashed cut-guide outline (lib/cut-
 *                         // guide-config.js) — resolveCutGuide(design)'s
 *                         // default, or an explicit override from the
 *                         // admin "with guide"/"without guide" download.
 *   customShapeKind?: string, // shape === 'custom' only — which sub-shape
 *                         // the guide traces (lib/cut-guide-config.js).
 * }} params
 * @returns {Promise<Uint8Array>}
 */
export async function generatePrintPdf({ imageUrl, shape, material, sizeInches, customW, customH, cutGuide = false, customShapeKind }) {
  // 1. Fetch image from Cloudinary — detect JPG vs PNG from content-type header
  const imgRes  = await fetch(imageUrl);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || '';
  const isPng = contentType.includes('png');

  // 2. Page size — A4 for every shape (see lib/paper-config.js), read from
  //    the one shared function rather than hardcoded here.
  const pageSize = pageSizePtForShape(shape);
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([pageSize.w, pageSize.h]);

  // 3. Embed image — use correct method or pdf-lib will throw / corrupt output
  const embeddedImage = isPng
    ? await pdfDoc.embedPng(imgBytes)
    : await pdfDoc.embedJpg(imgBytes);

  // 4. Same placement function the print-preview modal uses (app/page.js) —
  //    so the position/size shown to the customer before checkout can't
  //    diverge from what actually lands on the page here.
  const PT_PER_IN = 72;
  const placement = computeSheetPlacement(shape, { w: sizeInches }, customW, customH);
  const imgWidthPt  = placement.designW * PT_PER_IN;
  const imgHeightPt = placement.designH * PT_PER_IN;
  const x = placement.offsetX * PT_PER_IN;
  // PDF origin is bottom-left; placement.offsetY is measured from the top.
  const y = (placement.sheetH - placement.offsetY - placement.designH) * PT_PER_IN;

  // 5. Place on page
  page.drawImage(embeddedImage, { x, y, width: imgWidthPt, height: imgHeightPt });

  // 5b. Cut guide — vector overlay, drawn fresh here rather than baked into
  // the image above (see the imageUrl doc comment), so admin can regenerate
  // either version of the same order on demand (app/api/admin/orders/[id]/
  // download/route.js) with no extra storage.
  if (cutGuide && shapeSupportsCutGuide(shape, customShapeKind)) {
    drawCutGuideOnPage(page, { shape, customShapeKind, sizeObj: cutGuideSizeObj(shape, sizeInches), customW, customH });
  }

  // 6. Footer label. Whole-sheet shapes (fullsheet/bwsheet/multicircle/
  // waferletter) have no per-item size — labeling them with the sheet's
  // own raw width would print a long unformatted number, so they get the
  // sheet format (A4) instead, joined with " · " to read as one label
  // rather than running into the shape name. Material is stated here too
  // (not just on the production slip) — this footer travels WITH the PDF
  // itself, so whoever opens it to print has the same "which stock?"
  // answer even without the slip in hand.
  const isWholeSheet = isWholeSheetShape(shape);
  const sizeLabel = shape === 'custom'
    ? `${customW}" × ${customH}"`
    : isWholeSheet ? sheetFormatLabel(shape)
    : sizeInches ? `${sizeInches}"` : '';
  const materialLabel = materialDisplayLabel(resolveMaterial({ shape, material }));
  page.drawText(`EdiblePrint · ${materialLabel.toUpperCase()} · ${shapeDisplayLabel(shape).toUpperCase()}${isWholeSheet ? ' · ' : ' '}${sizeLabel}`, {
    x: 30, y: 18, size: 7, color: rgb(0.65, 0.65, 0.65),
  });

  return pdfDoc.save();
}

/**
 * Extracts ONE page from a customer-supplied multi-page PDF into its own
 * single-page PDF, for the "I already have my design" upload flow. Uses
 * pdf-lib's copyPages — a structural, vector-preserving page transplant
 * (content streams, fonts, embedded images copied as-is) — never rasterizes
 * or recompresses anything, so it doesn't count as "adjusting" the file, only
 * isolating the page the customer picked. The original multi-page file stays
 * archived untouched alongside this derived single-page asset.
 *
 * @param {string} pdfUrl      Cloudinary raw URL of the customer's original PDF
 * @param {number} pageNumber  1-indexed page to extract
 * @returns {Promise<Uint8Array>}
 */
export async function extractPdfPage(pdfUrl, pageNumber) {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Failed to fetch source PDF: ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const srcDoc = await PDFDocument.load(bytes);
  const pageIndex = Math.min(Math.max(0, pageNumber - 1), srcDoc.getPageCount() - 1);

  const outDoc = await PDFDocument.create();
  const [copiedPage] = await outDoc.copyPages(srcDoc, [pageIndex]);
  outDoc.addPage(copiedPage);

  return outDoc.save();
}
