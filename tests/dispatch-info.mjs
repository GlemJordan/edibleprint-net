// What the admin needs to dispatch an order without opening the code: how a
// dispatch is described (production slip, order panel, list — one wording),
// that orders saved before shippingPackages existed still resolve completely,
// the real production slip PDF (text extracted from the generated file), and
// the rules for the ship date / tracking number the admin records.
//
// Pure functions and an in-memory PDF — nothing external is touched, no dev
// server needed. (The panel and list rendering is checked in admin-dispatch-ui.mjs.)
import { describeDispatch, resolveOrderDispatch, formatPackageCount } from '../lib/shipping-config.js';
import { deriveSearchContext, buildOrderRecord, buildManualOrderRecord } from '../lib/order-record.js';
import { generateProductionSlip, slipShippingSummary } from '../lib/generate-pdf.js';
import { validateDispatchInput } from '../lib/dispatch-info.js';
import { fillLegacyDispatch } from '../lib/order-list-dispatch.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

// ── Wording ─────────────────────────────────────────────────────────────────
check('standard, 2 packages', describeDispatch('standard', 2).line === 'Standard — Canada Post Lettermail — 2 packages', describeDispatch('standard', 2));
check('tracked, 1 package (singular)', describeDispatch('tracked', 1).line === 'Tracked — Canada Post Xpresspost — 1 package');
check('pickup names no carrier and no package count',
  describeDispatch('pickup', 0).line === 'Pickup — East London, ON' && describeDispatch('pickup', 3).carrier === null && describeDispatch('pickup', 3).packages === 0);
check('an unknown package count is left off, never guessed', describeDispatch('standard', null).line === 'Standard — Canada Post Lettermail' && describeDispatch('standard').packages === null);
check("the legacy 'shipping' alias reads as standard", describeDispatch('shipping', 1).name === 'Standard');
check('formatPackageCount', formatPackageCount(1) === '1 package' && formatPackageCount(3) === '3 packages');

// ── Orders of every age resolve completely ─────────────────────────────────
const design = (quantity) => ({ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity, unitPrice: 14.99 });
const newStandard = { shippingMethod: 'standard', shippingPackages: 2, shipping: { method: 'canada_post_shipping' }, designs: [design(3)] };
const newTracked = { shippingMethod: 'tracked', shippingPackages: 1, shipping: { method: 'canada_post_shipping' }, designs: [design(5)] };
const newPickup = { shippingMethod: 'pickup', shippingPackages: 0, shipping: { method: 'pickup' }, designs: [design(4)] };
// Saved before shippingMethod / shippingPackages existed: no such fields at all.
const legacyShip = { shipping: { method: 'canada_post_shipping', label: 'Canada Post Lettermail' }, designs: [design(2), design(3)] };
const legacyPickup = { shipping: { method: 'pickup', label: 'Pickup — East London, ON' }, designs: [design(1)] };
const legacyNoDesigns = { shipping: { method: 'canada_post_shipping' } };

check('new standard order: uses its stored packages', resolveOrderDispatch(newStandard).line === 'Standard — Canada Post Lettermail — 2 packages');
check('new tracked order', resolveOrderDispatch(newTracked).line === 'Tracked — Canada Post Xpresspost — 1 package');
check('new pickup order: pickup, 0 packages, no carrier', (() => { const d = resolveOrderDispatch(newPickup); return d.method === 'pickup' && d.packages === 0 && d.carrier === null; })());
check('old website order (no fields): standard, packages worked out from its 5 sheets = 3',
  resolveOrderDispatch(legacyShip).line === 'Standard — Canada Post Lettermail — 3 packages', resolveOrderDispatch(legacyShip));
check('old pickup order: pickup', resolveOrderDispatch(legacyPickup).method === 'pickup');
check('old order with no designs at all: still standard + carrier, count omitted, no error',
  resolveOrderDispatch(legacyNoDesigns).line === 'Standard — Canada Post Lettermail' && resolveOrderDispatch(legacyNoDesigns).packages === null);
check('an empty / missing record does not throw', resolveOrderDispatch({}).method === 'standard' && resolveOrderDispatch(null).method === 'standard' && resolveOrderDispatch(undefined).method === 'standard');

// Real builders → the same answers (Stripe and manual).
const stripeSession = (method) => ({
  id: 'cs_test_x', customer_email: 'a@example.com', amount_total: 0,
  metadata: { customerName: 'X', shippingMethod: method, shippingCost: '0', shippingAddress: '1 A St', shippingCity: 'London', shippingProvince: 'Ontario', shippingPostal: 'N6A 1B2' },
});
const built = buildOrderRecord(stripeSession('standard'), [{ shape: 'circular', size: '6"', qty: '5', price: '14.99', notes: 'None', imageUrl: 'No image' }], 'EP-T', true);
check('a saved Stripe order describes itself as Standard — Canada Post Lettermail — 3 packages', resolveOrderDispatch(built).line === 'Standard — Canada Post Lettermail — 3 packages');
const manual = buildManualOrderRecord({ customerName: 'M', channel: 'walk_in', paymentMethod: 'cash', shape: 'circular', size: '6"', quantity: 4, amountCents: 900, shippingMethod: 'tracked', shippingAddress: { line1: '1 A St', city: 'London', province: 'ON', postalCode: 'N6A', country: 'CA' } }, 'EP-M');
check('a manual tracked order describes itself as Tracked — Canada Post Xpresspost — 1 package', resolveOrderDispatch(manual).line === 'Tracked — Canada Post Xpresspost — 1 package');

// Search context (what the list reads): new fields present, old orders derive them.
check('context: new order carries method + packages', (() => { const c = deriveSearchContext({ ...newStandard, payment: {}, customer: {}, production: {} }); return c.shippingMethod === 'standard' && c.packages === '2'; })());
check('context: old order derives standard + 3 packages', (() => { const c = deriveSearchContext({ ...legacyShip, payment: {}, customer: {}, production: {} }); return c.shippingMethod === 'standard' && c.packages === '3'; })());
check('context: pickup is pickup with 0 packages', (() => { const c = deriveSearchContext({ ...newPickup, payment: {}, customer: {}, production: {} }); return c.shippingMethod === 'pickup' && c.packages === '0'; })());
check("context: an unknown count is '' (so a stale value can't linger)", deriveSearchContext({ ...legacyNoDesigns, payment: {}, customer: {}, production: {} }).packages === '');

// ── The production slip ─────────────────────────────────────────────────────
check('slip lines: standard, 2 packages',
  slipShippingSummary({ shippingMethod: 'standard', shippingPackages: 2 }).methodLine === 'Method: Standard — Canada Post Lettermail — 2 packages');
check('slip lines: pickup says nothing ships and names no carrier',
  (() => { const s = slipShippingSummary({ isPickup: true, shippingMethod: 'standard' }); return /Pickup/.test(s.methodLine) && /nothing to ship/.test(s.methodLine) && !/Canada Post/.test(JSON.stringify(s)); })());
check('slip lines: several packages are packed as several mailers',
  /Packed in 3 × 9×12 protective mailers/.test(slipShippingSummary({ shippingMethod: 'standard', shippingPackages: 3 }).packedLine));
check('slip lines: tracked asks to record the tracking number, standard does not',
  /record tracking number/.test(slipShippingSummary({ shippingMethod: 'tracked', shippingPackages: 1 }).doneLine)
  && !/tracking/.test(slipShippingSummary({ shippingMethod: 'standard', shippingPackages: 1 }).doneLine));

// Generate the real PDFs and read their text back.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function slipText(order) {
  const bytes = await generateProductionSlip({
    orderNumber: 'EP-TEST', isTest: true, createdAt: '2026-09-25T12:00:00Z', customerName: 'Test Customer',
    customerEmail: 'a@example.com', customerPhone: '', designs: [{ shape: 'circular', shapeLabel: 'Round', size: '6" Round', quantity: 5, notes: 'None', imageUrl: 'No image' }],
    shippingLabel: 'ignored', shippingLine1: '1 Test St', shippingCity: 'London', shippingProv: 'Ontario', shippingPostal: 'N6A 1B2', allNotes: '',
    ...order,
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    text += content.items.map((i) => i.str).join(' ') + '\n';
  }
  return text.replace(/\s+/g, ' ');
}
const std = await slipText({ shippingMethod: 'standard', shippingPackages: 3, isPickup: false });
check('slip PDF, standard 3 packages: "Standard — Canada Post Lettermail — 3 packages"', std.includes('Standard — Canada Post Lettermail — 3 packages'), std.slice(std.indexOf('SHIPPING'), std.indexOf('SHIPPING') + 200));
check('slip PDF, standard: packing checklist says 3 mailers', std.includes('Packed in 3 × 9×12 protective mailers'));
const trk = await slipText({ shippingMethod: 'tracked', shippingPackages: 1, isPickup: false });
check('slip PDF, tracked: "Tracked — Canada Post Xpresspost — 1 package" and record-the-tracking', trk.includes('Tracked — Canada Post Xpresspost — 1 package') && trk.includes('record tracking number'), trk.slice(trk.indexOf('SHIPPING'), trk.indexOf('SHIPPING') + 200));
const pick = await slipText({ shippingMethod: 'pickup', shippingPackages: 0, isPickup: true, shippingLine1: undefined });
check('slip PDF, pickup: says pickup / nothing to ship, and never names a carrier',
  pick.includes('Pickup — East London, ON (nothing to ship)') && !/Canada Post|Lettermail|Xpresspost/.test(pick), pick.slice(pick.indexOf('SHIPPING'), pick.indexOf('SHIPPING') + 200));
const old = await slipText({ shippingMethod: undefined, shippingPackages: undefined, isPickup: false });
check('slip PDF, old order without the fields: still complete (standard + carrier), no error', old.includes('Standard — Canada Post Lettermail'));

// ── The list fills in packages for older orders still waiting to go out ─────
{
  const bodies = {
    'EP-A': { shipping: { method: 'canada_post_shipping' }, designs: [design(5)] },                         // old, pending → 3 packages
    'EP-B': { shippingMethod: 'tracked', shippingPackages: 1, shipping: { method: 'canada_post_shipping' }, designs: [design(3)] },
    'EP-BAD': null,                                                                                         // read fails
  };
  const fetched = [];
  const fetchRecord = async (id) => { fetched.push(id); if (bodies[id] === null) throw new Error('boom'); return bodies[id]; };
  const rows = [
    { orderId: 'EP-A', status: 'printed', shippingMethod: 'standard', packages: null },       // needs the read
    { orderId: 'EP-NEW', status: 'printed', shippingMethod: 'standard', packages: 2 },        // already has it
    { orderId: 'EP-DONE', status: 'shipped', shippingMethod: 'standard', packages: null },    // history: no read
    { orderId: 'EP-PU', status: 'pickup_ready', shippingMethod: 'pickup', packages: 0 },      // pickup: nothing to count
    { orderId: 'EP-PU2', status: 'paid', shippingMethod: 'pickup', packages: null },          // pickup, no count: no read
    { orderId: 'EP-BAD', status: 'paid', shippingMethod: 'standard', packages: null },        // read fails
    { orderId: 'EP-B', status: 'paid', shippingMethod: 'standard', packages: null },          // context said standard; record says tracked
  ];
  const origWarn = console.warn; console.warn = () => {};
  await fillLegacyDispatch(rows, fetchRecord);
  console.warn = origWarn;
  const by = Object.fromEntries(rows.map((r) => [r.orderId, r]));
  check('list fill: an old pending order gets its packages from its sheets (5 sheets = 3)', by['EP-A'].packages === 3 && by['EP-A'].dispatchLine === 'Standard — Canada Post Lettermail — 3 packages', by['EP-A']);
  check('list fill: only old pending shipping orders are read (never new, shipped or pickup ones)', fetched.sort().join() === 'EP-A,EP-B,EP-BAD', fetched);
  check('list fill: an order that already has its count is left alone', by['EP-NEW'].packages === 2);
  check('list fill: a shipped order keeps no count but still gets a line', by['EP-DONE'].packages === null && by['EP-DONE'].dispatchLine === 'Standard — Canada Post Lettermail');
  check('list fill: a pickup order reads as pickup', by['EP-PU'].dispatchLine === 'Pickup — East London, ON' && by['EP-PU2'].dispatchLine === 'Pickup — East London, ON');
  check('list fill: a failed read leaves that row without a count and does not fail the list', by['EP-BAD'].packages === null && by['EP-BAD'].dispatchLine === 'Standard — Canada Post Lettermail');
  check("list fill: the order's own record wins over the list's guess (tracked, 1 package)", by['EP-B'].shippingMethod === 'tracked' && by['EP-B'].packages === 1);
}

// ── Recording the ship date and tracking number ─────────────────────────────
const ok = (body) => validateDispatchInput(body).ok === true;
const bad = (body) => validateDispatchInput(body).ok === false;
check('a real date and a tracking number are accepted, trimmed', (() => { const r = validateDispatchInput({ shippedAt: '2026-09-28', trackingNumber: '  1234567890123456 ' }); return r.ok && r.changes.shippedAt === '2026-09-28' && r.changes.trackingNumber === '1234567890123456'; })());
check('a Canada Post style number with letters, spaces and dashes is accepted', ok({ trackingNumber: 'RB 123-456 789CA' }));
check('only the keys sent change (date alone / tracking alone)', (() => { const a = validateDispatchInput({ shippedAt: '2026-09-28' }); const b = validateDispatchInput({ trackingNumber: 'AB123' }); return !('trackingNumber' in a.changes) && !('shippedAt' in b.changes); })());
check('null or "" clears a field', (() => { const r = validateDispatchInput({ shippedAt: '', trackingNumber: null }); return r.ok && r.changes.shippedAt === null && r.changes.trackingNumber === null; })());
for (const [label, body] of [
  ['an impossible date (2026-02-30)', { shippedAt: '2026-02-30' }], ['a wrong format (09/28/2026)', { shippedAt: '09/28/2026' }],
  ['a date that is a number', { shippedAt: 20260928 }], ['a tracking number with symbols', { trackingNumber: '123<script>' }],
  ['a tracking number that is too long', { trackingNumber: 'A'.repeat(41) }], ['a tracking number that is a number', { trackingNumber: 1234567890 }],
  ['an empty body', {}], ['no body', null], ['an array', []], ['a string body', 'x'],
]) check(`rejected: ${label}`, bad(body), validateDispatchInput(body));
check('unrelated keys are ignored, not saved', (() => { const r = validateDispatchInput({ shippedAt: '2026-09-28', committedDate: '2026-01-01', shippingCost: 0 }); return r.ok && Object.keys(r.changes).join() === 'shippedAt'; })());

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
