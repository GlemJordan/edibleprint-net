// The package count saved on an order — what the admin panel and the
// production slip will read to know how many packages to prepare.
//
// It is derived (never stored in Stripe metadata, which is at its 50-key cap)
// by the same getShippingPackages() that priced the shipping, from the sheet
// quantities and shipping method. Checks both builders: the Stripe webhook's
// buildOrderRecord() and the admin's buildManualOrderRecord(). Pure functions
// — nothing external is touched, no dev server needed.
import { buildOrderRecord, buildManualOrderRecord } from '../lib/order-record.js';
import { getShippingPackages } from '../lib/shipping-config.js';

const results = [];
const check = (test, pass, detail) => results.push({ test, pass: !!pass, ...(pass ? {} : { detail }) });

// Designs as parseDesigns() hands them over from Stripe metadata (strings).
const parsed = (...qtys) => qtys.map((q) => ({
  shape: 'circular', size: '6" Round', qty: String(q), price: '14.99', notes: 'None', imageUrl: 'No image',
}));
const session = (shippingMethod) => ({
  id: 'cs_test_pkg', customer_email: 'pkg@example.com', amount_total: 0, payment_intent: 'pi_test',
  metadata: {
    customerName: 'Pkg Test', customerPhone: 'N/A', shippingMethod, shippingCost: '0',
    shippingAddress: '1 Test St', shippingCity: 'London', shippingProvince: 'Ontario', shippingPostal: 'N6A 1B2',
  },
});
const stripeRecord = (method, ...qtys) => buildOrderRecord(session(method), parsed(...qtys), 'EP-TEST', true);
const manualRecord = (input) => buildManualOrderRecord({
  customerName: 'Manual Test', channel: 'walk_in', paymentMethod: 'cash',
  shape: 'circular', size: '6" Round', quantity: 1, amountCents: 1000,
  shippingAddress: { line1: '1 Test St', city: 'London', province: 'Ontario', postalCode: 'N6A 1B2', country: 'CA' },
  saleDate: '2026-09-25',
  ...input,
}, 'EP-TEST');

// ── Stripe orders ───────────────────────────────────────────────────────────
const EXPECT = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
for (const sheets of [1, 2, 3, 4, 5]) {
  check(`stripe standard, ${sheets} sheet(s) in one design: ${EXPECT[sheets]} package(s)`, stripeRecord('standard', sheets).shippingPackages === EXPECT[sheets]);
  check(`stripe tracked, ${sheets} sheet(s): 1 package`, stripeRecord('tracked', sheets).shippingPackages === 1);
  check(`stripe pickup, ${sheets} sheet(s): 0 packages`, stripeRecord('pickup', sheets).shippingPackages === 0);
}
check('stripe standard: sheets are summed across designs (2 + 2 + 1 = 5 -> 3 packages)', stripeRecord('standard', 2, 2, 1).shippingPackages === 3);
check("stripe: the legacy 'shipping' alias is a standard order (3 sheets -> 2 packages)", stripeRecord('shipping', 3).shippingPackages === 2);
check('stripe: a record keeps its method and carrier alongside the packages',
  stripeRecord('tracked', 2).shippingMethod === 'tracked' && stripeRecord('tracked', 2).shippingCarrier === 'Canada Post Xpresspost');

// ── Manual orders ───────────────────────────────────────────────────────────
for (const sheets of [1, 2, 3, 4, 5]) {
  const std = manualRecord({ shippingMethod: 'standard', quantity: sheets });
  check(`manual standard, ${sheets} sheet(s): ${EXPECT[sheets]} package(s), method and carrier saved`,
    std.shippingPackages === EXPECT[sheets] && std.shippingMethod === 'standard' && std.shippingCarrier === 'Canada Post Lettermail', std);
  check(`manual tracked, ${sheets} sheet(s): 1 package`, manualRecord({ shippingMethod: 'tracked', quantity: sheets }).shippingPackages === 1);
}
const pick = manualRecord({ shippingMethod: 'pickup', quantity: 5, shippingAddress: undefined });
check('manual pickup: 0 packages, no carrier, no address, still flagged local_pickup',
  pick.shippingPackages === 0 && pick.shippingCarrier === undefined && pick.shipping.address === undefined
  && pick.shipping.method === 'pickup' && pick.urgentFlags?.includes('local_pickup'), pick);
check('manual: a shipped order has its address and the carrier as the label',
  manualRecord({ shippingMethod: 'standard' }).shipping.address?.line1 === '1 Test St'
  && manualRecord({ shippingMethod: 'tracked' }).shipping.label === 'Canada Post Xpresspost');
check('manual: an older caller sending only isPickup still works (true -> pickup, false -> standard)',
  manualRecord({ shippingMethod: undefined, isPickup: true, quantity: 4 }).shippingPackages === 0
  && manualRecord({ shippingMethod: undefined, isPickup: false, quantity: 4 }).shippingPackages === 2);
check('manual and stripe agree: the same order gives the same package count',
  [1, 2, 3, 4, 5].every((n) => manualRecord({ shippingMethod: 'standard', quantity: n }).shippingPackages === stripeRecord('standard', n).shippingPackages));
check('the record function matches the pricing function', [1, 2, 3, 4, 5].every((n) => stripeRecord('standard', n).shippingPackages === getShippingPackages('standard', n)));

const failures = results.filter((r) => !r.pass);
console.log(JSON.stringify(failures, null, 2));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.test);
console.log(`\n${results.length - failures.length}/${results.length} passed.`);
process.exit(failures.length ? 1 : 0);
