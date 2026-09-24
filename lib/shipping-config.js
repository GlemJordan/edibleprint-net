/**
 * Single source of truth for shipping methods and pricing. Used by both the
 * client checkouts (app/page.js, app/designs/_components/CustomerCheckoutForm.js)
 * and the server checkout route (app/api/create-checkout) so the displayed
 * total and the amount charged to Stripe never diverge. Must stay free of
 * server-only imports — it ships in the client bundle.
 */

/**
 * @typedef {{
 *   id: 'standard' | 'tracked',
 *   label: string,
 *   carrier: string,
 *   price: number,
 *   minBusinessDays: number,
 *   maxBusinessDays: number,
 *   tracking: boolean,
 * }} ShippingMethod
 */

// Customer-facing prices, CAD. The UI must read these through
// getShippingMethods()/getShippingCost() — never hardcode them in a component.
export const STANDARD_SHIPPING_PRICE = 9.99;
// PROVISIONAL — pending confirmation of the real Xpresspost counter price.
export const TRACKED_SHIPPING_PRICE = 29.99;

/** @type {Readonly<Record<string, Readonly<ShippingMethod>>>} */
const SHIPPING_METHODS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    label: 'Standard shipping',
    carrier: 'Canada Post Lettermail',
    price: STANDARD_SHIPPING_PRICE,
    minBusinessDays: 3,
    maxBusinessDays: 10,
    tracking: false,
  }),
  tracked: Object.freeze({
    id: 'tracked',
    label: 'Tracked shipping',
    carrier: 'Canada Post Xpresspost',
    price: TRACKED_SHIPPING_PRICE,
    minBusinessDays: 1,
    maxBusinessDays: 2,
    tracking: true,
  }),
});

export const DEFAULT_SHIPPING_METHOD = 'standard';

// TODO: retirar alias 'shipping' después de noviembre 2026
// Pre-catalog clients sent 'shipping' for the single flat-rate option; a tab
// left open across the deploy must still be able to pay.
const LEGACY_ALIASES = { shipping: 'standard' };

/** Ordered list of paid shipping methods, for rendering the checkout selector. */
export function getShippingMethods() {
  return Object.values(SHIPPING_METHODS);
}

/** True for a catalog id ('standard' | 'tracked') or a legacy alias of one. Pickup is not a shipping method. */
export function isKnownShippingMethod(id) {
  return typeof id === 'string' && (Object.hasOwn(SHIPPING_METHODS, id) || Object.hasOwn(LEGACY_ALIASES, id));
}

/**
 * Resolves legacy aliases to their catalog id; passes 'pickup' and catalog
 * ids through unchanged. Returns null for anything else — the caller decides
 * whether that's an error (create-checkout) or a default (display code).
 *
 * @param {string} id
 * @returns {'pickup' | 'standard' | 'tracked' | null}
 */
export function normalizeShippingMethod(id) {
  // typeof guard: Object.hasOwn() coerces its key to a string, so an array
  // like ['tracked'] would otherwise match and be returned as-is.
  if (typeof id !== 'string') return null;
  if (id === 'pickup') return 'pickup';
  if (Object.hasOwn(LEGACY_ALIASES, id)) return LEGACY_ALIASES[id];
  if (Object.hasOwn(SHIPPING_METHODS, id)) return id;
  return null;
}

/**
 * Method details, falling back to 'standard' for a missing/unknown id — which
 * is also how orders saved before shippingMethod existed must be read.
 *
 * @param {string} [id]
 * @returns {Readonly<ShippingMethod>}
 */
export function getShippingMethod(id) {
  const normalized = normalizeShippingMethod(id);
  return SHIPPING_METHODS[normalized] || SHIPPING_METHODS[DEFAULT_SHIPPING_METHOD];
}

/**
 * The shipping method of a saved OrderRecord, for records of any age: new
 * ones carry shippingMethod; older ones don't, and read as 'pickup' when
 * shipping.method says so, otherwise 'standard'.
 *
 * @param {{ shippingMethod?: string, shipping?: { method?: string } } | null | undefined} record
 * @returns {'pickup' | 'standard' | 'tracked'}
 */
export function resolveOrderShippingMethod(record) {
  const stored = normalizeShippingMethod(record?.shippingMethod);
  if (stored) return stored;
  return record?.shipping?.method === 'pickup' ? 'pickup' : DEFAULT_SHIPPING_METHOD;
}

/**
 * @param {string} [id]  'pickup' | 'standard' | 'tracked' (or the legacy 'shipping')
 * @returns {number} shipping cost in CAD — 0 for pickup, 'standard' price for a missing/unknown id
 */
export function getShippingCost(id) {
  if (id === 'pickup') return 0;
  return getShippingMethod(id).price;
}

/**
 * Days Canada Post has no collection or delivery in Ontario (we mail from
 * London, ON). UPDATE ONCE A YEAR — add the next year's dates each December.
 * Source: canadapost-postescanada.ca "Canada Post holiday schedule". Family
 * Day is deliberately absent: Canada Post delivers on it. When a holiday
 * falls on a weekend, Canada Post closes the next business day instead, so
 * the observed date is listed.
 *
 * 2026 copied from Canada Post's published table. 2027 is not published yet:
 * computed from the same rules — re-check against the official table once
 * it's out.
 */
export const CANADA_POST_HOLIDAYS = Object.freeze([
  // 2026
  '2026-01-01', // New Year's Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-18', // Victoria Day
  '2026-07-01', // Canada Day
  '2026-08-03', // Civic Holiday (ON)
  '2026-09-07', // Labour Day
  '2026-09-30', // National Day for Truth and Reconciliation
  '2026-10-12', // Thanksgiving
  '2026-11-11', // Remembrance Day
  '2026-12-25', // Christmas Day
  '2026-12-28', // Boxing Day (Dec 26 is a Saturday)
  // 2027 (computed — verify against Canada Post's table)
  '2027-01-01', // New Year's Day
  '2027-03-26', // Good Friday
  '2027-03-29', // Easter Monday
  '2027-05-24', // Victoria Day
  '2027-07-01', // Canada Day
  '2027-08-02', // Civic Holiday (ON)
  '2027-09-06', // Labour Day
  '2027-09-30', // National Day for Truth and Reconciliation
  '2027-10-11', // Thanksgiving
  '2027-11-11', // Remembrance Day
  '2027-12-27', // Christmas Day (Dec 25 is a Saturday)
  '2027-12-28', // Boxing Day (Dec 26 is a Sunday)
]);

const HOLIDAY_SET = new Set(CANADA_POST_HOLIDAYS);

/**
 * Adds n business days to a date, skipping Saturdays, Sundays and
 * CANADA_POST_HOLIDAYS.
 *
 * Accepts either a 'YYYY-MM-DD' string (returns the same format — pure
 * calendar arithmetic, no timezone involved, matching how committedDate is
 * stored; see lib/delivery-urgency.js) or a Date (returns a new Date,
 * computed on its local calendar date).
 *
 * @template {string | Date} T
 * @param {T} date
 * @param {number} n  non-negative whole number of business days
 * @returns {T}
 */
export function addBusinessDays(date, n) {
  const isString = typeof date === 'string';
  let d;
  if (isString) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new Error(`addBusinessDays: expected YYYY-MM-DD, got "${date}"`);
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  } else if (date instanceof Date && !Number.isNaN(date.getTime())) {
    d = new Date(date.getTime());
  } else {
    throw new Error('addBusinessDays: expected a YYYY-MM-DD string or a valid Date');
  }
  if (!Number.isInteger(n) || n < 0) throw new Error(`addBusinessDays: n must be a non-negative integer, got ${n}`);

  const pad = (x) => String(x).padStart(2, '0');
  const getDay = isString ? () => d.getUTCDay() : () => d.getDay();
  const isoDate = isString
    ? () => d.toISOString().slice(0, 10)
    : () => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const step = isString ? () => d.setUTCDate(d.getUTCDate() + 1) : () => d.setDate(d.getDate() + 1);

  let remaining = n;
  while (remaining > 0) {
    step();
    const day = getDay();
    if (day !== 0 && day !== 6 && !HOLIDAY_SET.has(isoDate())) remaining--;
  }
  return /** @type {T} */ (isString ? d.toISOString().slice(0, 10) : d);
}
