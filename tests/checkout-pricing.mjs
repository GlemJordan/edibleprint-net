// Server-side pricing of /api/create-checkout: what Stripe is actually told to
// charge, for the per-package shipping rule and the quantity limits.
//
// Runs the REAL route handler in-process (no dev server, no network): the
// Stripe SDK's HTTPS transport is replaced with a recorder that answers like
// Stripe would, so what's asserted is the exact line_items Stripe receives —
// not a recomputation of them here. Nothing external is touched.
//
//   sheets:      1  2  3  4  5  6  7
//   standard  $ 9.99 9.99 19.98 19.98 29.97 29.97 39.96   (ceil(sheets/2) × 9.99)
//   tracked   $29.99 flat, up to TRACKED_MAX_SHEETS; refused above it
//   pickup    $0, no shipping line at all
import https from 'https';
import { EventEmitter } from 'events';
import { register } from 'node:module';
import { getShippingCost, getShippingPackages, TRACKED_MAX_SHEETS, MAX_SHEETS_PER_ORDER, MAX_SHEETS_PER_DESIGN } from '../lib/shipping-config.js';

process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_pricing_check';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

// ── Stripe transport stub ───────────────────────────────────────────────────
const stripeCalls = [];
// The SDK calls https.request({...}) with no callback, listens for 'response',
// and writes the body once the request emits 'socket'.
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
    setImmediate(() => {
      res.emit('data', JSON.stringify({ id: 'cs_test_pricing', url: 'https://checkout.stripe.test/cs_test_pricing' }));
      res.emit('end');
    });
  };
  setImmediate(() => req.emit('socket', { connecting: false }));
  return req;
};

// The route imports 'next/server' the way Next's bundler resolves it; plain
// Node needs the extension, so map that one specifier and nothing else.
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, next) { return next(s === 'next/server' ? 'next/server.js' : s, c); }`,
));

const { POST } = await import('../app/api/create-checkout/route.js');

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

// A $14.99 6" round per design (catalog: circular/c6), quantity as given.
const PRINT_UNIT = 14.99;
const design = (quantity) => ({ shape: 'circular', sizeId: 'c6', size: '6" Round', material: 'icing', quantity, unitPrice: 0.01, notes: '', imageUrl: 'https://example.test/x.png' });
const payload = (over = {}) => ({
  customerName: 'Pricing Test', customerEmail: 'pricing@example.com', customerPhone: '',
  shippingAddress: '1 Test St', shippingCity: 'London', shippingProvince: 'Ontario', shippingPostal: 'N6A 1B2',
  shippingMethod: 'standard', designConfirmed: true, designs: [design(1)],
  ...over,
});

// POST and return { status, json, stripe } where stripe = the one Stripe call made (or null).
async function checkout(body) {
  const before = stripeCalls.length;
  const res = await POST(new Request('http://localhost:3000/api/create-checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  const call = stripeCalls.length > before ? stripeCalls[stripeCalls.length - 1] : null;
  return { status: res.status, json, call };
}

// Line items out of Stripe's form-encoded body: [{ name, cents }]
function lineItems(call) {
  const items = [];
  for (let i = 0; call.has(`line_items[${i}][price_data][unit_amount]`); i++) {
    items.push({
      name: call.get(`line_items[${i}][price_data][product_data][name]`),
      cents: Number(call.get(`line_items[${i}][price_data][unit_amount]`)) * Number(call.get(`line_items[${i}][quantity]`)),
    });
  }
  return items;
}
const shippingLine = (call) => lineItems(call).find((li) => /shipping/i.test(li.name));
const totalCents = (call) => lineItems(call).reduce((s, li) => s + li.cents, 0);
const cents = (dollars) => Math.round(dollars * 100);

// ── 1..5 sheets (and one past): what Stripe is charged, per method ──────────
const EXPECT_STANDARD = { 1: 9.99, 2: 9.99, 3: 19.98, 4: 19.98, 5: 29.97, 6: 29.97, 7: 39.96 };
for (const sheets of [1, 2, 3, 4, 5]) {
  const printCents = cents(PRINT_UNIT * sheets);

  const std = await checkout(payload({ designs: [design(sheets)] }));
  const stdShip = std.call && shippingLine(std.call);
  check(`standard, ${sheets} sheet(s): Stripe charges $${EXPECT_STANDARD[sheets]} shipping (${Math.ceil(sheets / 2)} package(s))`,
    std.status === 200 && stdShip?.cents === cents(EXPECT_STANDARD[sheets]), { status: std.status, stdShip, json: std.json });
  check(`standard, ${sheets} sheet(s): total to Stripe = prints + shipping = what the checkout shows`,
    std.call && totalCents(std.call) === printCents + cents(getShippingCost('standard', sheets)),
    std.call && { stripe: totalCents(std.call), shown: printCents + cents(getShippingCost('standard', sheets)) });

  const trk = await checkout(payload({ shippingMethod: 'tracked', designs: [design(sheets)] }));
  const trkShip = trk.call && shippingLine(trk.call);
  check(`tracked, ${sheets} sheet(s): Stripe charges a flat $29.99`, trk.status === 200 && trkShip?.cents === cents(29.99), { status: trk.status, trkShip });
  check(`tracked, ${sheets} sheet(s): total to Stripe = prints + shipping = what the checkout shows`,
    trk.call && totalCents(trk.call) === printCents + cents(getShippingCost('tracked', sheets)));

  const pick = await checkout(payload({ shippingMethod: 'pickup', designs: [design(sheets)] }));
  check(`pickup, ${sheets} sheet(s): no shipping line, total is just the prints`,
    pick.status === 200 && pick.call && !shippingLine(pick.call) && totalCents(pick.call) === printCents, { status: pick.status });
}

// Sheets are summed across designs, not read per design.
const split = await checkout(payload({ designs: [design(2), design(2), design(1)] }));
check('standard: 5 sheets across 3 designs = 3 packages = $29.97', split.status === 200 && shippingLine(split.call)?.cents === cents(29.97), split.json);
check('standard: the shipping line says how many packages', /3 packages/.test(shippingLine(split.call)?.name || ''), shippingLine(split.call));
const one = await checkout(payload({ designs: [design(2)] }));
check('standard: 2 sheets = 1 package, and the line does not say "1 packages"', !/packages/.test(shippingLine(one.call)?.name || ''), shippingLine(one.call));

// The metadata gets no new key; the package count is derived, not stored.
check('metadata: no packages key added (Stripe caps it at 50)', ![...split.call.keys()].some((k) => /metadata\[.*package/i.test(k)));
check('metadata: still at most 50 keys for a 5-design order with a needed-by date', await (async () => {
  const five = await checkout(payload({ neededByDate: '2026-12-01', designs: [design(1), design(1), design(1), design(1), design(1)] }));
  const keys = [...five.call.keys()].filter((k) => k.startsWith('metadata['));
  return five.status === 200 && keys.length <= 50 ? true : { status: five.status, keys: keys.length };
})());

// ── Tracked capacity ────────────────────────────────────────────────────────
const trkMax = await checkout(payload({ shippingMethod: 'tracked', designs: [design(TRACKED_MAX_SHEETS)] }));
check(`tracked: ${TRACKED_MAX_SHEETS} sheets (the maximum) is accepted`, trkMax.status === 200, trkMax.json);
const trkOver = await checkout(payload({ shippingMethod: 'tracked', designs: [design(TRACKED_MAX_SHEETS + 1)] }));
check(`tracked: ${TRACKED_MAX_SHEETS + 1} sheets is refused with 400 and nothing reaches Stripe`,
  trkOver.status === 400 && trkOver.call === null && /not available for orders this size/.test(trkOver.json.error), trkOver);
const trkOverSplit = await checkout(payload({ shippingMethod: 'tracked', designs: [design(4), design(3)] }));
check('tracked: the limit is on the order total, not per design (4 + 3 sheets)', trkOverSplit.status === 400 && trkOverSplit.call === null, trkOverSplit.json);
const stdBig = await checkout(payload({ designs: [design(TRACKED_MAX_SHEETS + 1)] }));
check('standard still works past the tracked limit (7 sheets = 4 packages = $39.96)',
  stdBig.status === 200 && shippingLine(stdBig.call)?.cents === cents(39.96), stdBig.json);
const pickBig = await checkout(payload({ shippingMethod: 'pickup', designs: [design(MAX_SHEETS_PER_ORDER)] }));
check('pickup is unaffected by the tracked limit', pickBig.status === 200 && !shippingLine(pickBig.call));

// ── Quantity validation: nothing but a whole number 1..20 gets through ──────
const BAD = [
  ['0', 0], ['negative', -1], ['negative large', -100], ['decimal', 1.5], ['tiny decimal', 0.01],
  ['numeric string', '2'], ['string', 'abc'], ['null', null], ['missing', undefined], ['NaN-ish string', 'NaN'],
  ['boolean', true], ['array', [2]], ['object', { valueOf: 2 }], [`over the per-design cap (${MAX_SHEETS_PER_DESIGN + 1})`, MAX_SHEETS_PER_DESIGN + 1],
  ['huge', 1e9], ['Infinity as string', 'Infinity'],
];
for (const [label, q] of BAD) {
  for (const method of ['standard', 'tracked', 'pickup']) {
    const r = await checkout(payload({ shippingMethod: method, designs: [design(q)] }));
    check(`quantity ${label} with ${method}: 400 and nothing charged`, r.status === 400 && r.call === null, { status: r.status, json: r.json, charged: !!r.call });
  }
}
const mixed = await checkout(payload({ designs: [design(2), design(-1)] }));
check('one bad quantity among good ones refuses the whole order', mixed.status === 400 && mixed.call === null, mixed.json);
const zeroFirst = await checkout(payload({ designs: [design(0), design(20)] }));
check('a zero quantity cannot be hidden behind a big one', zeroFirst.status === 400 && zeroFirst.call === null);

// The old hole: quantity was the price multiplier, so a negative or fractional one paid less for the prints.
const cheaper = await checkout(payload({ shippingMethod: 'pickup', designs: [design(-5)] }));
check('a negative quantity can no longer make the prints cost less (or nothing)', cheaper.status === 400 && cheaper.call === null);

// ── Order limits ────────────────────────────────────────────────────────────
const atLimit = await checkout(payload({ designs: [design(MAX_SHEETS_PER_DESIGN)] }));
check(`exactly ${MAX_SHEETS_PER_ORDER} sheets is accepted (10 packages = $99.90)`, atLimit.status === 200 && shippingLine(atLimit.call)?.cents === cents(99.9), atLimit.json);
const overTotal = await checkout(payload({ designs: [design(10), design(11)] }));
check(`${MAX_SHEETS_PER_ORDER + 1} sheets across two designs is refused, with the contact message`,
  overTotal.status === 400 && overTotal.call === null && /contact us before ordering/.test(overTotal.json.error), overTotal.json);
const sixDesigns = await checkout(payload({ designs: [1, 1, 1, 1, 1, 1].map(design) }));
check('a 6th design is refused (the order record only holds 5)', sixDesigns.status === 400 && sixDesigns.call === null, sixDesigns.json);
const noDesigns = await checkout(payload({ designs: [] }));
check('no designs is still a 400', noDesigns.status === 400 && noDesigns.call === null);
const notArray = await checkout(payload({ designs: 'nope' }));
check('designs that is not an array is a 400, not a crash', notArray.status === 400 && notArray.call === null, notArray.json);

// ── The browser can't set the amount ────────────────────────────────────────
const forged = await checkout(payload({ shippingCost: 0.01, shippingAmount: 1, designs: [design(5)] }));
check('a client-sent shippingCost is ignored: 5 sheets still charge $29.97', forged.status === 200 && shippingLine(forged.call)?.cents === cents(29.97), forged.json);
const legacy = await checkout(payload({ shippingMethod: 'shipping', designs: [design(3)] }));
check("the legacy 'shipping' alias is priced as standard, per package ($19.98 for 3 sheets)",
  legacy.status === 200 && shippingLine(legacy.call)?.cents === cents(19.98), legacy.json);
const badMethod = await checkout(payload({ shippingMethod: 'overnight' }));
check('an unknown shipping method is still a 400', badMethod.status === 400 && badMethod.call === null);

// Package counts the webhook/order record will store come from the same function.
check('packages: 1..5 sheets -> 1,1,2,2,3 standard; 1 tracked; 0 pickup',
  [1, 2, 3, 4, 5].map((n) => getShippingPackages('standard', n)).join() === '1,1,2,2,3'
  && getShippingPackages('tracked', 5) === 1 && getShippingPackages('pickup', 5) === 0);

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
