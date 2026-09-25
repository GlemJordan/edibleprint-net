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

// Shipping is charged per PACKAGE, not per order. A "sheet" is one physical A4
// print: one unit of a design's quantity (a multicircle unit is one sheet too,
// its circles share it), so an order's sheets are the sum of every design's
// quantity. Only SHEETS_PER_PACKAGE sheets fit in one standard-shipping
// package, so a 5-sheet order is 3 packages and 3 shipping charges.
export const SHEETS_PER_PACKAGE = 2;

// Tracked ships every order in ONE envelope for one flat price, up to this
// many sheets. PROVISIONAL: 6 is a placeholder until the real capacity of the
// Xpresspost envelope is confirmed at the post office counter. Above it,
// tracked is unavailable (selector disables it, create-checkout rejects it).
export const TRACKED_MAX_SHEETS = 6;

// Order size limits, enforced server-side in create-checkout. Bigger orders
// can't be produced in the 1–2 business day window, so they go through the
// owner before being paid. (The per-design cap is what stops one line from
// being forged into a huge or negative quantity; the per-order cap is what
// keeps the sum honest across the up-to-5 designs.)
export const MAX_SHEETS_PER_DESIGN = 20;
export const MAX_SHEETS_PER_ORDER = 20;
export const MAX_DESIGNS_PER_ORDER = 5;

// "Similar price" threshold for the standard-vs-tracked hint: tracked counts as
// similar when it's within this fraction of what standard would cost.
const SIMILAR_PRICE_TOLERANCE = 0.1;

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

// Business days between payment and the order leaving us, before any
// transport time. Shipping methods above describe transport only; anything
// that promises "you'll have it by X" must add this on top (see
// latestArrivalDate). Production info on /shipping should match.
export const PRODUCTION_BUSINESS_DAYS = Object.freeze({ min: 1, max: 2 });

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
 * Delivery window as customer-facing text, e.g. '3–10 business days'.
 *
 * @param {Readonly<ShippingMethod>} method
 */
export function formatBusinessDayRange(method) {
  const { minBusinessDays: min, maxBusinessDays: max } = method;
  if (min === max) return `${max} business day${max === 1 ? '' : 's'}`;
  return `${min}–${max} business days`;
}

/**
 * The one-line terms shown under a method, e.g.
 * '$9.99 · 3–10 business days · No tracking number'. Every surface that
 * describes a method (selector, policy page) builds it here so wording and
 * numbers can't drift apart.
 *
 * With `sheets`, the price is what THIS order pays (the checkout selector).
 * Without it, it's the rate as a policy statement: standard is per package.
 *
 * @param {Readonly<ShippingMethod>} method
 * @param {number} [sheets]  the order's sheet count, when there is one
 */
export function describeShippingMethod(method, sheets) {
  const price = sheets === undefined
    ? (method.id === 'standard'
      ? '$' + method.price.toFixed(2) + ' per package of up to ' + SHEETS_PER_PACKAGE + ' sheets'
      : '$' + method.price.toFixed(2))
    : '$' + getShippingCost(method.id, sheets).toFixed(2);
  return [
    price,
    formatBusinessDayRange(method),
    method.tracking ? 'Tracking number included' : 'No tracking number',
  ].join(' · ');
}

/**
 * Production time as customer-facing text, e.g. '1–2 business days'.
 */
export function formatProductionWindow() {
  const { min, max } = PRODUCTION_BUSINESS_DAYS;
  if (min === max) return `${max} business day${max === 1 ? '' : 's'}`;
  return `${min}–${max} business days`;
}

/**
 * The site-wide "how long does shipping take" sentence — the single wording
 * every general mention (FAQ, terms, ...) uses, so the site says one thing.
 */
export function shippingTimesSentence() {
  const standard = SHIPPING_METHODS.standard;
  const tracked = SHIPPING_METHODS.tracked;
  return `Standard shipping takes ${standard.minBusinessDays} to ${standard.maxBusinessDays} business days`
    + ` and does not include a tracking number. Tracked shipping arrives in`
    + ` ${tracked.minBusinessDays} to ${tracked.maxBusinessDays} business days.`;
}

/**
 * The one rule for a standard-shipping order that didn't (fully) arrive, worded
 * once for /refund and /shipping so the two can't drift apart. "Part of" matters
 * because a big order ships in several packages: only the package that's missing
 * is reprinted, not the whole order.
 */
export function standardNotArrivedSentence() {
  return `If part of a standard shipping order has not arrived ${SHIPPING_METHODS.standard.maxBusinessDays} business days`
    + ' after it was mailed, contact us and we will reprint and resend that part once, at no cost.';
}

/**
 * Latest date an order paid for on `fromDate` can arrive under a method:
 * its maximum production time plus the method's maximum transport time,
 * counting weekends and CANADA_POST_HOLIDAYS as non-days. This is what the
 * customer experiences — from paying to holding the sheet.
 *
 * @param {string} id  'standard' | 'tracked'
 * @param {string} fromDate  YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function latestArrivalDate(id, fromDate) {
  return addBusinessDays(fromDate, PRODUCTION_BUSINESS_DAYS.max + getShippingMethod(id).maxBusinessDays);
}

/**
 * How a needed-by date sits against what we can promise. Advisory only —
 * never used to block a purchase.
 *   'ok'             no date given/malformed, or the chosen method makes it
 *   'method-too-slow' the chosen method can't make it but another one can
 *   'unreachable'    no method makes it, whichever is chosen
 *
 * @param {string} id  the customer's currently selected method
 * @param {string} neededBy  YYYY-MM-DD, or '' when the customer gave none
 * @param {string} today  YYYY-MM-DD, in the business timezone
 * @returns {'ok' | 'method-too-slow' | 'unreachable'}
 */
export function assessNeededByDate(id, neededBy, today) {
  if (typeof neededBy !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return 'ok';
  const misses = (methodId) => latestArrivalDate(methodId, today) > neededBy;
  if (getShippingMethods().every((m) => misses(m.id))) return 'unreachable';
  return misses(id) ? 'method-too-slow' : 'ok';
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
 * Checks one order's sheet quantities against the order limits. Strict on
 * purpose — this guards money: every entry must be a real JSON number that is
 * a whole number from 1 to MAX_SHEETS_PER_DESIGN, at most MAX_DESIGNS_PER_ORDER
 * designs, and the total at most MAX_SHEETS_PER_ORDER. A numeric string,
 * decimal, zero, negative, NaN or missing value is rejected, never coerced.
 *
 * @param {unknown} quantities  one quantity per design, as the client sent them
 * @returns {{ ok: true, sheets: number } | { ok: false, error: string }}
 */
export function validateSheetQuantities(quantities) {
  if (!Array.isArray(quantities) || quantities.length === 0) return { ok: false, error: 'No designs provided' };
  if (quantities.length > MAX_DESIGNS_PER_ORDER) {
    return { ok: false, error: `An order can have at most ${MAX_DESIGNS_PER_ORDER} designs` };
  }
  let sheets = 0;
  for (const q of quantities) {
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_SHEETS_PER_DESIGN) {
      return { ok: false, error: `Quantity must be a whole number from 1 to ${MAX_SHEETS_PER_DESIGN}` };
    }
    sheets += q;
  }
  if (sheets > MAX_SHEETS_PER_ORDER) {
    return { ok: false, error: `An order can have at most ${MAX_SHEETS_PER_ORDER} sheets. ${orderLimitMessage()}` };
  }
  return { ok: true, sheets };
}

/** Shown when the customer reaches the order's sheet limit. */
export function orderLimitMessage() {
  return `For orders over ${MAX_SHEETS_PER_ORDER} sheets, please contact us before ordering.`;
}

/** Shown on the selector when tracked can't take the order. */
export const TRACKED_UNAVAILABLE_MESSAGE = 'Tracked shipping is not available for orders this size. Please contact us.';

/**
 * Sheets from quantities that are ALREADY trusted (validated at checkout, or
 * read back from a saved order): each is read as a whole number, junk counts as
 * the 1 the record builders already default it to. For the client's live
 * totals and the webhook — never for deciding a price from raw client input;
 * that's validateSheetQuantities() above.
 *
 * @param {Array<number | string>} quantities
 */
export function countSheets(quantities) {
  return quantities.reduce((sum, q) => sum + (parseInt(q, 10) || 1), 0);
}

/** False only for tracked on an order too big for its one envelope. */
export function isMethodAvailable(id, sheets) {
  return normalizeShippingMethod(id) !== 'tracked' || sheets <= TRACKED_MAX_SHEETS;
}

/**
 * The method a checkout should actually use for `sheets`: the customer's
 * choice, unless it's tracked and the order has outgrown it — then standard,
 * so the selector, the summary and the request all agree.
 */
export function resolveMethodForSheets(id, sheets) {
  return isMethodAvailable(id, sheets) ? id : DEFAULT_SHIPPING_METHOD;
}

function assertSheets(sheets) {
  if (!Number.isInteger(sheets) || sheets < 1) {
    throw new Error(`shipping: sheets must be a whole number of at least 1, got ${sheets}`);
  }
}

/**
 * Packages an order ships in: 0 for pickup (nothing ships), 1 for tracked (one
 * envelope), ceil(sheets / SHEETS_PER_PACKAGE) for standard.
 *
 * @param {string} [id]  'pickup' | 'standard' | 'tracked' (or the legacy 'shipping')
 * @param {number} sheets  the order's sheet count
 */
export function getShippingPackages(id, sheets) {
  if (id === 'pickup') return 0;
  assertSheets(sheets);
  return getShippingMethod(id).id === 'tracked' ? 1 : Math.ceil(sheets / SHEETS_PER_PACKAGE);
}

/**
 * Shipping cost in CAD for an order of `sheets` sheets: 0 for pickup, one
 * flat tracked price, or the standard price for every package. A missing or
 * unknown id reads as standard. Throws on a sheet count that isn't a whole
 * number of at least 1, rather than quietly charging for one package.
 *
 * @param {string} [id]  'pickup' | 'standard' | 'tracked' (or the legacy 'shipping')
 * @param {number} sheets
 */
export function getShippingCost(id, sheets) {
  if (id === 'pickup') return 0;
  const packages = getShippingPackages(id, sheets);
  // Cents, so 3 × 9.99 is 29.97 and not 29.970000000000002.
  return Math.round(getShippingMethod(id).price * 100 * packages) / 100;
}

/**
 * The hint under the selector when standard splits an order across packages,
 * or null when there's nothing to say. The tracked comparison is worked out
 * from the two costs: "a similar price" only when it is, the actual price when
 * it isn't, and nothing about tracked when the order is too big for it.
 *
 * @param {string} id  the method currently in effect
 * @param {number} sheets
 * @returns {string | null}
 */
export function multiPackageNotice(id, sheets) {
  if (id === 'pickup' || getShippingMethod(id).id !== 'standard') return null;
  const packages = getShippingPackages('standard', sheets);
  if (packages < 2) return null;
  let text = `Your order ships in ${packages} packages.`;
  if (isMethodAvailable('tracked', sheets)) {
    const standardCost = getShippingCost('standard', sheets);
    const trackedCost = getShippingCost('tracked', sheets);
    const similar = Math.abs(trackedCost - standardCost) <= standardCost * SIMILAR_PRICE_TOLERANCE;
    text += similar
      ? ' Tracked shipping ships in one package for a similar price.'
      : ` Tracked shipping ships in one package for $${trackedCost.toFixed(2)}.`;
  }
  return text;
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
