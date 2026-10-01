// "I already have my design" on a Full Sheet (UPLOAD_FIT_SHAPES): the
// customer's file is printed scaled into the sheet's printable area — 15mm
// clear at the top, 13mm at the bottom — instead of edge-to-edge, where the
// printer can't reach. Checks the placement math the customer's preview and
// the production PDF share (uploadPlacement()), and that the production PDF
// (generateUploadFitPdf()) takes the chosen page, keeps a PDF as vectors,
// handles a sideways page, and refuses what it can't place faithfully so the
// pipeline falls back to the original file.
//
// Pure functions + pdf-lib in-process — fetch is stubbed, nothing external
// is touched, no dev server needed.
import { PDFDocument, PDFName, PDFRawStream, degrees, rgb } from 'pdf-lib';
import { uploadPlacement, UPLOAD_FIT_SHAPES } from '../lib/paper-config.js';
import { generateUploadFitPdf, generateProductionSlip } from '../lib/generate-pdf.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

const MM = 25.4;
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const margins = (p) => ({
  top: p.offsetY * MM,
  bottom: (p.sheetH - p.offsetY - p.designH) * MM,
  left: p.offsetX * MM,
  right: (p.sheetW - p.offsetX - p.designW) * MM,
});

check('full sheet is fitted, B&W is not', UPLOAD_FIT_SHAPES.includes('fullsheet') && !UPLOAD_FIT_SHAPES.includes('bwsheet'), UPLOAD_FIT_SHAPES);

// An A4 file (the size we ask customers for) and a landscape one.
for (const [name, w, h] of [['A4 portrait', 210, 297], ['landscape 3:2', 300, 200], ['square', 100, 100]]) {
  const p = uploadPlacement('fullsheet', w, h);
  const m = margins(p);
  check(`${name}: at least 15mm top`, m.top >= 15 - 0.01, m);
  check(`${name}: at least 13mm bottom`, m.bottom >= 13 - 0.01, m);
  check(`${name}: inside the sides`, m.left >= 5.6 && m.right >= 5.6 && near(m.left, m.right), m);
  check(`${name}: proportions kept`, near(p.designW / p.designH, w / h, 1e-9), p);
}
const a4 = margins(uploadPlacement('fullsheet', 210, 297));
check('A4 file: fills the printable height (15mm / 13mm)', near(a4.top, 15) && near(a4.bottom, 13), a4);

// Production PDF.
const stub = (bytes, type) => { globalThis.fetch = async () => new Response(bytes, { headers: { 'content-type': type } }); };
const formBBoxes = async (pdfBytes) => {
  const doc = await PDFDocument.load(pdfBytes);
  const boxes = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Form')) {
      boxes.push(obj.dict.get(PDFName.of('BBox')).asArray().map((n) => Math.round(n.asNumber())));
    }
  }
  return { doc, boxes };
};

// A 3-page customer PDF with a distinct page size per page, so the embedded
// page's box tells which page was used.
const multi = await PDFDocument.create();
for (const size of [[595, 842], [400, 400], [500, 300]]) {
  const pg = multi.addPage(size);
  pg.drawRectangle({ x: 0, y: 0, width: size[0], height: size[1], color: rgb(0.8, 0.1, 0.1) });
}
const multiBytes = await multi.save();
stub(multiBytes, 'application/pdf');
{
  const { doc, boxes } = await formBBoxes(await generateUploadFitPdf({ fileUrl: 'stub', shape: 'fullsheet', material: 'icing', pageNumber: 2 }));
  const { width, height } = doc.getPage(0).getSize();
  check('PDF upload: one A4 page out', doc.getPageCount() === 1 && near(width, 595.28, 0.5) && near(height, 841.89, 0.5), { width, height });
  check('PDF upload: the chosen page (2) is the one placed', boxes.length === 1 && boxes[0][2] === 400 && boxes[0][3] === 400, boxes);
  check('PDF upload: embedded as vectors, not rasterized', doc.context.enumerateIndirectObjects().every(([, o]) => !(o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))));
}

// An image upload.
const tinyPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
stub(tinyPng, 'image/png');
{
  const out = await PDFDocument.load(await generateUploadFitPdf({ fileUrl: 'stub', shape: 'fullsheet', material: 'icing' }));
  check('PNG upload: one A4 page out', out.getPageCount() === 1 && near(out.getPage(0).getWidth(), 595.28, 0.5));
}

// What it refuses (the pipeline then prints the original file instead).
// A page shown sideways (/Rotate 90, e.g. a landscape export) is placed the
// way viewers show it, not refused.
const rotated = await PDFDocument.create();
const sideways = rotated.addPage([842, 595]);
sideways.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.2, 0.5, 0.8) });
sideways.setRotation(degrees(90));
stub(await rotated.save(), 'application/pdf');
{
  const out = await PDFDocument.load(await generateUploadFitPdf({ fileUrl: 'stub', shape: 'fullsheet' }));
  check('rotated PDF page (90°): placed on one A4 page', out.getPageCount() === 1 && near(out.getPage(0).getWidth(), 595.28, 0.5));
}

stub(new TextEncoder().encode('GIF89a not supported'), 'image/gif');
let threw = false;
try { await generateUploadFitPdf({ fileUrl: 'stub', shape: 'fullsheet' }); } catch { threw = true; }
check('unsupported file type: refused (falls back to the original file)', threw);

// The production slip tells whoever prints which way the file was handled.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(' ') + '\n';
  return text.replace(/\s+/g, ' ');
}
const slipFor = (design) => generateProductionSlip({
  orderNumber: 'EP-UPLD', isTest: true, createdAt: '2026-09-30T12:00:00Z', customerName: 'Upload Test', customerEmail: 'a@example.com', customerPhone: '',
  designs: [{ shapeLabel: 'Full Sheet', material: 'icing', size: 'A4', quantity: 1, notes: 'None', imageUrl: 'No image', sourceType: 'upload', ...design }],
  shippingMethod: 'pickup', shippingPackages: 0, isPickup: true, allNotes: '',
});
const fullSlip = await pdfText(await slipFor({ shape: 'fullsheet', pageCount: 3, selectedPage: 2 }));
check('slip, full sheet upload: says it was fitted to the printable area', fullSlip.includes('FITTED TO PRINTABLE AREA') && !fullSlip.includes('PRINT AS-IS'), fullSlip.slice(0, 600));
check('slip, full sheet upload: print the PDF at 100%, page noted', fullSlip.includes('Print the print-ready PDF at 100%') && fullSlip.includes('page 2 of 3'));
const bwSlip = await pdfText(await slipFor({ shape: 'bwsheet', shapeLabel: 'B&W Sheet' }));
check('slip, B&W upload: still printed as-is', bwSlip.includes('PRINT AS-IS') && !bwSlip.includes('FITTED TO PRINTABLE AREA'));

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
