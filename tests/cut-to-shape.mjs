// "Cut to shape (plotter)" end to end on the server side: which shapes offer it,
// what Stripe is charged (recomputed by the server whatever the browser sends),
// that a cut design never gets a printed cut guide, and what the order record,
// production slip, production PDF and cut SVG say about it.
//
// Nothing external is touched, no dev server needed: the REAL create-checkout
// handler runs in-process with Stripe's transport replaced by a recorder (the
// same technique as checkout-pricing.mjs), and the PDFs are generated in
// memory and read back.
import https from 'https';
import { EventEmitter } from 'events';
import { register } from 'node:module';
import { CUTTING_ENABLED, CUT_SURCHARGE, shapeSupportsCut, cutSurchargeFor, cutIsActive } from '../lib/cutting-config.js';
import { resolveCutGuide, shapeSupportsCutGuide, designHasCutOutline } from '../lib/cut-guide-config.js';
import { buildOrderRecord } from '../lib/order-record.js';
import { generateProductionSlip, generatePrintPdf } from '../lib/generate-pdf.js';
import { buildCutSvg } from '../lib/cut-svg.js';

process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_cut_check';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

const stripeCalls = [];
https.request = () => {
  const req = new EventEmitter();
  const chunks = [];
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.write = (c) => { chunks.push(Buffer.from(c)); return true; };
  req.end = (c) => {
    if (c) chunks.push(Buffer.from(c));
    stripeCalls.push(new URLSearchParams(Buffer.concat(chunks).toString()));
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = { 'request-id': 'req_test' };
    res.setEncoding = () => {};
    req.emit('response', res);
    setImmediate(() => { res.emit('data', JSON.stringify({ id: 'cs_test_cut', url: 'https://checkout.stripe.test/cs_test_cut' })); res.emit('end'); });
  };
  setImmediate(() => req.emit('socket', { connecting: false }));
  return req;
};
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, next) { return next(s === 'next/server' ? 'next/server.js' : s, c); }`,
));
const { POST } = await import('../app/api/create-checkout/route.js');

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });
const cents = (d) => Math.round(d * 100);

// ── Which shapes offer it, and at what price ────────────────────────────────
check('the feature is on', CUTTING_ENABLED === true);
for (const [shape, sizeId] of [['circular', 'c6'], ['heart', 'h6'], ['square', 's6'], ['custom', 'custom'], ['multicircle', 'mc2'], ['multicircle', 'mc3']]) {
  check(`${shape} ${sizeId}: offered, +$4.99 per sheet`, shapeSupportsCut(shape, sizeId) && cutSurchargeFor(shape, sizeId) === 4.99, { offered: shapeSupportsCut(shape, sizeId), price: cutSurchargeFor(shape, sizeId) });
}
for (const shape of ['fullsheet', 'bwsheet', 'waferletter']) {
  check(`${shape}: not offered`, !shapeSupportsCut(shape, 'a4') && !shapeSupportsCut(shape, 'bw1'));
}

// ── The server recomputes the price, whatever the browser sends ─────────────
const base = (over) => ({ shape: 'circular', sizeId: 'c6', size: '6" Round', material: 'icing', quantity: 1, unitPrice: 0.01, notes: '', imageUrl: 'https://example.test/x.png', ...over });
const payload = (designs, over = {}) => ({
  customerName: 'Cut Test', customerEmail: 'cut@example.com', customerPhone: '',
  shippingAddress: '1 Test St', shippingCity: 'London', shippingProvince: 'Ontario', shippingPostal: 'N6A 1B2',
  shippingMethod: 'pickup', designConfirmed: true, designs, ...over,
});
async function checkout(body) {
  const before = stripeCalls.length;
  const res = await POST(new Request('http://localhost:3000/api/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const json = await res.json();
  return { status: res.status, json, call: stripeCalls.length > before ? stripeCalls[stripeCalls.length - 1] : null };
}
const printCents = (call) => { const out = []; for (let i = 0; call.has(`line_items[${i}][price_data][unit_amount]`); i++) out.push(Number(call.get(`line_items[${i}][price_data][unit_amount]`)) * Number(call.get(`line_items[${i}][quantity]`))); return out; };
const meta = (call, k) => call.get(`metadata[${k}]`);

const CASES = [
  ['round',  { shape: 'circular', sizeId: 'c6', size: '6" Round' }, 14.99],
  ['heart',  { shape: 'heart', sizeId: 'h6', size: '6" Heart' }, 14.99],
  ['square', { shape: 'square', sizeId: 's6', size: '6" Square' }, 14.99],
  ['custom', { shape: 'custom', sizeId: 'custom', size: '4"x4"', customW: 4, customH: 4, customShapeKind: 'oval' }, 14.99],
  ['cookie sheet 2"', { shape: 'multicircle', sizeId: 'mc2', size: '2” Circles on A4 Sheet' }, 19.99],
  ['cookie sheet 3"', { shape: 'multicircle', sizeId: 'mc3', size: '3” Circles on A4 Sheet' }, 19.99],
];
for (const [name, shapeFields, unit] of CASES) {
  const plain = await checkout(payload([base({ ...shapeFields, quantity: 2, cutGuide: true })]));
  check(`${name}, no cut: Stripe charges the print only (2 × $${unit})`, plain.status === 200 && printCents(plain.call)[0] === cents(unit * 2), plain.json);
  check(`${name}, no cut: cutFlags 0, and the guide the customer asked for is kept`, meta(plain.call, 'cutFlags') === '0' && meta(plain.call, 'cutGuideFlags') === '1', [meta(plain.call, 'cutFlags'), meta(plain.call, 'cutGuideFlags')]);

  // The browser claims a price of $0.01 and a guide: the server ignores the price and drops the guide.
  const cut = await checkout(payload([base({ ...shapeFields, quantity: 2, cutToShape: true, cutGuide: true, unitPrice: 0.01 })]));
  check(`${name}, cut: Stripe charges 2 × ($${unit} + $4.99) = $${((unit + 4.99) * 2).toFixed(2)} though the browser sent $0.01`,
    cut.status === 200 && printCents(cut.call)[0] === cents((unit + 4.99) * 2), { status: cut.status, cents: cut.call && printCents(cut.call) });
  check(`${name}, cut: cutFlags 1 and the guide is forced OFF although the browser sent cutGuide:true`,
    meta(cut.call, 'cutFlags') === '1' && meta(cut.call, 'cutGuideFlags') === '0', [meta(cut.call, 'cutFlags'), meta(cut.call, 'cutGuideFlags')]);
}

// Not offered: a claimed cut is ignored — no surcharge, no flag (and the guide is untouched).
for (const [name, fields, unit] of [
  ['full sheet', { shape: 'fullsheet', sizeId: 'a4', size: 'A4 Full Sheet' }, 19.99],
  ['B&W sheet', { shape: 'bwsheet', sizeId: 'bw1', size: 'B&W Sheet' }, 9.99],
]) {
  const r = await checkout(payload([base({ ...fields, cutToShape: true })]));
  check(`${name}: a claimed cut is ignored (no surcharge, cutFlags 0)`, r.status === 200 && printCents(r.call)[0] === cents(unit) && meta(r.call, 'cutFlags') === '0', { status: r.status, cents: r.call && printCents(r.call), flag: r.call && meta(r.call, 'cutFlags') });
}

// The rule runs one way: the cut turns the guide off; the guide never touches the cut.
{
  const withGuide = await checkout(payload([base({ quantity: 2, cutToShape: true, cutGuide: true })]));
  const noGuide = await checkout(payload([base({ quantity: 2, cutToShape: true, cutGuide: false })]));
  check('cut + guide:false → still cut (cutFlags 1), same price as with guide:true, guide 0',
    meta(noGuide.call, 'cutFlags') === '1' && meta(noGuide.call, 'cutGuideFlags') === '0' && printCents(noGuide.call)[0] === printCents(withGuide.call)[0] && printCents(noGuide.call)[0] === cents((14.99 + 4.99) * 2),
    [meta(noGuide.call, 'cutFlags'), meta(noGuide.call, 'cutGuideFlags'), printCents(noGuide.call)]);
  const guideOnly = await checkout(payload([base({ quantity: 2, cutToShape: false, cutGuide: true })]));
  check('no cut + guide:true → guide kept (1), not cut (0), no surcharge',
    meta(guideOnly.call, 'cutFlags') === '0' && meta(guideOnly.call, 'cutGuideFlags') === '1' && printCents(guideOnly.call)[0] === cents(14.99 * 2));
}

// 3 cookie sheets cut = $14.97 of surcharge, recomputed by the server.
for (const [name, fields] of [['2"', { sizeId: 'mc2', size: '2” Circles on A4 Sheet' }], ['3"', { sizeId: 'mc3', size: '3” Circles on A4 Sheet' }]]) {
  const plain = await checkout(payload([base({ shape: 'multicircle', ...fields, quantity: 3 })]));
  const cut = await checkout(payload([base({ shape: 'multicircle', ...fields, quantity: 3, cutToShape: true, unitPrice: 0.01 })]));
  const diff = printCents(cut.call)[0] - printCents(plain.call)[0];
  check(`3 cookie sheets ${name}, cut: Stripe charges $74.94 = 3 × ($19.99 + $4.99), surcharge $14.97 (browser sent $0.01)`,
    cut.status === 200 && printCents(cut.call)[0] === 7494 && diff === 1497, { status: cut.status, cents: cut.call && printCents(cut.call), diff });
}

// Several designs: each keeps its own cut flag and price; shipping still follows the sheets.
{
  const r = await checkout(payload([
    base({ quantity: 1, cutToShape: true, cutGuide: true }),
    base({ shape: 'heart', sizeId: 'h6', size: '6" Heart', quantity: 2, cutGuide: true }),
    base({ shape: 'square', sizeId: 's6', size: '6" Square', quantity: 1, cutToShape: true }),
  ], { shippingMethod: 'standard' }));
  const c = r.call && printCents(r.call);
  check('3 designs, 2 cut: each priced on its own (19.98 · 29.98 · 19.98) + 2 packages of shipping',
    r.status === 200 && c[0] === 1998 && c[1] === 2998 && c[2] === 1998 && c[3] === 1998, { status: r.status, c });
  check('3 designs: flags are per design (cutFlags 101, cutGuideFlags 010)', r.call && meta(r.call, 'cutFlags') === '101' && meta(r.call, 'cutGuideFlags') === '010', r.call && [meta(r.call, 'cutFlags'), meta(r.call, 'cutGuideFlags')]);
}

// ── One rule everywhere: a cut design never has a guide ─────────────────────
check('resolveCutGuide: cut + guide asked → no guide', resolveCutGuide({ shape: 'circular', cutToShape: true, cutGuide: true }) === false);
check('resolveCutGuide: guide asked, not cut → guide', resolveCutGuide({ shape: 'circular', cutToShape: false, cutGuide: true }) === true);
check('cutIsActive: marked but the shape does not offer it → not active; heart and cookie sheets → active',
  cutIsActive({ shape: 'fullsheet', sizeId: 'a4', cutToShape: true }) === false
  && cutIsActive({ shape: 'heart', sizeId: 'h6', cutToShape: true }) === true
  && cutIsActive({ shape: 'multicircle', sizeId: 'mc2', cutToShape: true }) === true
  && cutIsActive({ shape: 'multicircle', sizeId: 'mc3', cutToShape: false }) === false);

// ── What the webhook saves ──────────────────────────────────────────────────
const session = { customer_email: 'cut@example.com', metadata: { customerName: 'Cut Test', shippingMethod: 'standard', shippingCost: '9.99', shippingAddress: '1 Test St', shippingCity: 'London', shippingProvince: 'Ontario', shippingPostal: 'N6A 1B2' }, amount_total: 2498, payment_intent: 'pi_test' };
// Designs as the webhook decodes them; cutGuide:true is a STALE value that must not survive.
const cutDesign = { shape: 'circular', material: 'icing', cutToShape: true, cutGuide: true, size: '6" Round', qty: '1', price: '19.99', notes: 'None', imageUrl: 'https://example.test/x.png' };
const record = buildOrderRecord(session, [cutDesign], 'EP-CUT1', true);
const saved = record.designs[0];
check('order record: cutToShape true, cutGuide false', saved.cutToShape === true && saved.cutGuide === false, saved);

// ── Production slip ─────────────────────────────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(' ') + '\n';
  return text.replace(/\s+/g, ' ');
}
const slip = await pdfText(await generateProductionSlip({
  orderNumber: 'EP-CUT1', isTest: true, createdAt: '2026-09-28T12:00:00Z', customerName: 'Cut Test', customerEmail: 'a@example.com', customerPhone: '',
  designs: [{ ...saved, shapeLabel: 'Round', imageUrl: 'No image' }], shippingMethod: 'standard', shippingPackages: 1, isPickup: false,
  shippingLine1: '1 Test St', shippingCity: 'London', shippingProv: 'Ontario', shippingPostal: 'N6A 1B2', allNotes: '',
}));
check('slip: says CUT TO SHAPE ON PLOTTER', slip.includes('YES — CUT TO SHAPE ON PLOTTER'), slip.slice(slip.indexOf('PRODUCT'), slip.indexOf('PRODUCT') + 300));
check('slip: checklist asks to confirm the cut before packing', slip.includes('CUT TO SHAPE ON PLOTTER (confirm before packing)'));
check('slip: "Cut guide: No"', /Cut guide:\s*No/.test(slip));
const noCutSlip = await pdfText(await generateProductionSlip({
  orderNumber: 'EP-CUT2', isTest: true, createdAt: '2026-09-28T12:00:00Z', customerName: 'Cut Test', customerEmail: 'a@example.com', customerPhone: '',
  designs: [{ shape: 'circular', shapeLabel: 'Round', material: 'icing', cutToShape: false, cutGuide: true, size: '6" Round', quantity: 1, notes: 'None', imageUrl: 'No image' }],
  shippingMethod: 'pickup', shippingPackages: 0, isPickup: true, allNotes: '',
}));
check('slip, not cut: "Cut: No" and "Cut guide: YES"', /Cut:\s*No/.test(noCutSlip) && noCutSlip.includes('Cut guide: YES — printed on sheet') && !noCutSlip.includes('CUT TO SHAPE ON PLOTTER'));

// ── Production PDF: no guide on a cut design ────────────────────────────────
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function pathOps(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const ol = await (await doc.getPage(1)).getOperatorList();
  return ol.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
}
const guided = await generatePrintPdf({ imageUrl: PNG, shape: 'circular', sizeInches: 6, cutGuide: resolveCutGuide({ ...cutDesign, cutToShape: false }) });
const cutPdf = await generatePrintPdf({ imageUrl: PNG, shape: 'circular', sizeInches: 6, cutGuide: resolveCutGuide(saved) });
check('production PDF, not cut: draws the guide outline', (await pathOps(guided)) >= 1, await pathOps(guided));
check('production PDF, cut: NO guide outline at all', (await pathOps(cutPdf)) === 0, await pathOps(cutPdf));

// ── The cut SVG still works for a cut order ─────────────────────────────────
for (const [name, d] of [['round', { ...saved }], ['heart', { ...saved, shape: 'heart', size: '6" Heart' }], ['custom oval', { ...saved, shape: 'custom', size: '4"x4"', customShapeKind: 'oval' }]]) {
  const svg = buildCutSvg(d);
  check(`cut SVG, ${name} (cut order): offered, A4 in mm, outline only`, designHasCutOutline(d) && /width="210mm" height="297mm"/.test(svg) && (svg.match(/<path /g) || []).length === 1 && !/<image/.test(svg));
}
check('the shapes that offer a cut all have a cut outline for the SVG', ['circular', 'heart', 'square'].every((s) => shapeSupportsCutGuide(s)) && shapeSupportsCutGuide('custom', 'oval'));

// ── Cookie sheet, cut: production PDF without guide, SVG circles where the PDF puts them ──
// Every subpath's bounding box (mm, y down from the top) drawn on the PDF's first page, via the operator list.
async function pdfPathBoxesMm(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const H = page.view[3];
  const ol = await page.getOperatorList();
  const mul = (a, b) => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; const boxes = [];
  for (let k = 0; k < ol.fnArray.length; k++) {
    const fn = ol.fnArray[k], a = ol.argsArray[k];
    if (fn === pdfjs.OPS.save) stack.push(ctm.slice());
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === pdfjs.OPS.transform) ctm = mul(a, ctm);
    else if (fn === pdfjs.OPS.constructPath && a[2]?.length === 4) {
      const [x0, y0, x1, y1] = a[2];
      const p = (x, y) => [ctm[0]*x + ctm[2]*y + ctm[4], ctm[1]*x + ctm[3]*y + ctm[5]];
      const [c0, c1] = [p(x0, y0), p(x1, y1)];
      boxes.push({ x0: Math.min(c0[0], c1[0]) * 25.4 / 72, x1: Math.max(c0[0], c1[0]) * 25.4 / 72, y0: (H - Math.max(c0[1], c1[1])) * 25.4 / 72, y1: (H - Math.min(c0[1], c1[1])) * 25.4 / 72 });
    }
  }
  return boxes;
}
const svgCircleBoxes = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => {
  const n = m[1].match(/-?\d+(?:\.\d+)?/g).map(Number); // M cx+rx cy A rx ry 0 1 0 cx-rx cy …
  return { x0: (n[0] + n[7]) / 2 - n[2], x1: (n[0] + n[7]) / 2 + n[2], y0: n[1] - n[3], y1: n[1] + n[3] };
});
for (const [name, sizeId, size, sizeInches, circles] of [['2"', 'mc2', '2” Circles on A4 Sheet', 2, 15], ['3"', 'mc3', '3” Circles on A4 Sheet', 3, 6]]) {
  const mcDesign = { shape: 'multicircle', material: 'icing', cutToShape: true, cutGuide: true, size, qty: '1', price: '24.99', notes: 'None', imageUrl: 'https://example.test/x.png' };
  const mcSaved = buildOrderRecord(session, [mcDesign], 'EP-CUT3', true).designs[0];
  check(`cookie sheet ${name}: order record is cut and has no guide`, mcSaved.cutToShape === true && mcSaved.cutGuide === false, mcSaved);

  const pdfCut = await generatePrintPdf({ imageUrl: PNG, shape: 'multicircle', sizeInches, cutGuide: resolveCutGuide(mcSaved) });
  const pdfGuide = await generatePrintPdf({ imageUrl: PNG, shape: 'multicircle', sizeInches, cutGuide: resolveCutGuide({ ...mcSaved, cutToShape: false, cutGuide: true }) });
  check(`cookie sheet ${name}, cut: the production PDF has NO guide circles`, (await pathOps(pdfCut)) === 0, await pathOps(pdfCut));
  check(`cookie sheet ${name}, not cut: the PDF draws ${circles} guide circles`, (await pathOps(pdfGuide)) === circles, await pathOps(pdfGuide));

  const svg = buildCutSvg(mcSaved);
  const svgBoxes = svgCircleBoxes(svg);
  const pdfBoxes = await pdfPathBoxesMm(pdfGuide);
  check(`cookie sheet ${name}, cut order: "Download cut SVG" is offered and holds ${circles} circles, A4 in mm, no image`,
    designHasCutOutline(mcSaved) && svgBoxes.length === circles && /width="210mm" height="297mm"/.test(svg) && !/<image/.test(svg), { offered: designHasCutOutline(mcSaved), circles: svgBoxes.length });
  const maxDelta = svgBoxes.reduce((m, sb) => Math.max(m, Math.min(...pdfBoxes.map((pb) => Math.max(Math.abs(sb.x0 - pb.x0), Math.abs(sb.x1 - pb.x1), Math.abs(sb.y0 - pb.y0), Math.abs(sb.y1 - pb.y1))))), 0);
  check(`cookie sheet ${name}: every SVG circle sits where the PDF draws it (max difference ${maxDelta.toFixed(4)} mm)`, pdfBoxes.length === circles && maxDelta < 0.01, { pdfCircles: pdfBoxes.length, maxDelta });
  // The circles are inside the sheet and don't overlap one another.
  const inside = svgBoxes.every((b) => b.x0 >= 0 && b.x1 <= 210 && b.y0 >= 0 && b.y1 <= 297);
  const apart = svgBoxes.every((a, i) => svgBoxes.every((b, j) => i === j || a.x1 <= b.x0 + 0.01 || b.x1 <= a.x0 + 0.01 || a.y1 <= b.y0 + 0.01 || b.y1 <= a.y0 + 0.01));
  check(`cookie sheet ${name}: the circles are inside the A4 page and don't overlap`, inside && apart, { inside, apart });

  const mcSlip = await pdfText(await generateProductionSlip({
    orderNumber: 'EP-CUT3', isTest: true, createdAt: '2026-09-28T12:00:00Z', customerName: 'Cut Test', customerEmail: 'a@example.com', customerPhone: '',
    designs: [{ ...mcSaved, shapeLabel: 'Cookie Sheet', imageUrl: 'No image' }], shippingMethod: 'pickup', shippingPackages: 0, isPickup: true, allNotes: '',
  }));
  check(`cookie sheet ${name}: the slip says CUT TO SHAPE ON PLOTTER and Cut guide: No`, mcSlip.includes('YES — CUT TO SHAPE ON PLOTTER') && /Cut guide:\s*No/.test(mcSlip));
}

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
