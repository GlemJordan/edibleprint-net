// Shipping labels for the orders that still have to go out by Canada Post:
// which orders get one, how many (one per package), what each label says,
// and how the labels land on the Letter sheets they're printed on.
//
// Pure and isomorphic — no I/O, no pdf-lib — so the admin page can use the
// same sheet arithmetic it shows and tests can check every rule without a
// server. The PDF itself is drawn by lib/shipping-labels-pdf.js and the
// orders are read by lib/shipping-labels-data.js.
//
// Address wording follows Canada Post's addressing guidelines
// (canadapost-postescanada.ca → Support → Addressing guidelines →
// Important information): uppercase; municipality, province and postal code
// together on the last line with ONE space before the province and TWO
// before the postal code; postal code as "A1A 1A1"; no "#"; no punctuation
// unless part of a proper name; no "CANADA" on a domestic address; lines
// under 40 characters excluding spaces (the postal code may move to its own
// last line when the municipality line gets too long); return address top
// left and never in a larger font than the destination.

import { resolveOrderDispatch, getShippingMethod } from './shipping-config.js';
import { isOrderResolved } from './production-status.js';
import { BUSINESS_ADDRESS } from './business-info.js';

// ── Sheet layout ────────────────────────────────────────────────────────────
// Each label is a full-width strip of a Letter sheet, printed at the TOP of
// the page, so the owner can print a few, cut them off and feed the shorter
// sheet back in later: the printer still takes it because it keeps the full
// 8.5" width.
export const LABEL_STRIP_IN = 2.75;
export const LABELS_PER_SHEET = 4;           // 11" / 2.75"
// Free spaces a partly used sheet can have and still feed: 4 = a new sheet,
// 3 = 8.25" left, 2 = 5.5" left. One space (2.75") is shorter than what home
// printers accept (their minimum paper length is about 5"), so it's not offered.
export const FEEDABLE_FREE_SPACES = Object.freeze([4, 3, 2]);

export const RETURN_NAME = 'EDIBLEPRINT';
// Printed above the order reference on every label: the sheets travel flat in
// 9×12 mailers and a fold ruins them.
export const LABEL_NOTE = 'DO NOT BEND / NE PAS PLIER';

export const MAX_LINE_CHARS = 40; // Canada Post: under 40 per line, excluding spaces

// Orders per downloaded PDF. The route re-reads every chosen order before
// printing, so this keeps one download well inside a serverless request
// (and its URL short); the page caps its selection to match and asks for
// batches beyond it.
export const MAX_ORDERS_PER_PDF = 100;

// ── Provinces ───────────────────────────────────────────────────────────────
// The checkout stores the full English name ("Ontario"); manual orders store
// whatever the admin typed. Both read as the official two-letter symbol.
const PROVINCE_CODES = (() => {
  const codes = {
    AB: ['alberta', 'alta'],
    BC: ['british columbia', 'colombie britannique'],
    MB: ['manitoba', 'man'],
    NB: ['new brunswick', 'nouveau brunswick'],
    NL: ['newfoundland and labrador', 'newfoundland', 'nfld', 'terre neuve et labrador', 'nl'],
    NS: ['nova scotia', 'nouvelle ecosse'],
    NT: ['northwest territories', 'territoires du nord ouest', 'nwt'],
    NU: ['nunavut'],
    ON: ['ontario', 'ont'],
    PE: ['prince edward island', 'pei', 'ile du prince edouard'],
    QC: ['quebec', 'que', 'pq'],
    SK: ['saskatchewan', 'sask'],
    YT: ['yukon', 'yukon territory'],
  };
  const map = {};
  for (const [code, names] of Object.entries(codes)) {
    map[code.toLowerCase()] = code;
    for (const n of names) map[n] = code;
  }
  return map;
})();

const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Official two-letter symbol for a province or territory written any common
 * way ("Ontario", "ON", "Québec", "P.E.I."), or null when it isn't one.
 * @param {string} [input]
 * @returns {string | null}
 */
export function provinceCode(input) {
  const key = stripAccents(String(input ?? '')).toLowerCase().replace(/[.'’]/g, '').replace(/[-\s]+/g, ' ').trim();
  return PROVINCE_CODES[key] || null;
}

// Letters a Canadian postal code never uses: D F I O Q U (and W, Z first).
const POSTAL_RE = /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s*-?\s*(\d[ABCEGHJ-NPRSTV-Z]\d)$/;

/**
 * "n6a1b2", "N6A-1B2", " n6a 1b2 " → "N6A 1B2"; null when it isn't a valid
 * Canadian postal code.
 * @param {string} [input]
 * @returns {string | null}
 */
export function formatPostalCode(input) {
  const m = POSTAL_RE.exec(String(input ?? '').trim().toUpperCase());
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * One address line in Canada Post style: uppercase, no "#", no commas,
 * periods or other punctuation (apostrophes, hyphens and the slash of "C/O"
 * stay — they're part of names like O'BRIEN or SAINTE-FOY), single spaces. Accents are kept;
 * Canada Post accepts them.
 * @param {string} [s]
 */
export function cleanAddressLine(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toUpperCase()
    .replace(/’/g, "'")
    .replace(/#/g, ' ')
    .replace(/[.,;:!?"()[\]{}<>*_=+|\\~^`@$%&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIT_ONLY_RE = /^(?:#|NO\.?\s+)?\s*([A-Z]?\d{1,5}[A-Z]?)$/i;
const DESIGNATOR_RE = /^(APARTMENT|APT|APPARTEMENT|APP|UNIT|UNITE|UNITÉ|SUITE|STE|BUREAU|BUR|ROOM|RM|PENTHOUSE|PH)\.?\s*(?:#|NO\.?)?\s*([A-Z0-9-]{1,8})$/i;
const STARTS_WITH_CIVIC_RE = /^\d/;
const HAS_UNIT_PREFIX_RE = /^[A-Z0-9]{1,6}-\d/;

/**
 * The civic address line(s). The checkout stores "street, unit" in one field
 * (address + ", " + unit), and customers type units every way. A bare unit
 * ("4", "#4") goes in front with a hyphen, Canada Post's preferred form
 * ("4-123 MAIN ST"); a unit with its designator ("Apt 4", "Suite #200") stays
 * after the street ("123 MAIN ST APT 4"). Anything else after a comma — a
 * buzzer code, "c/o" — is kept, on its own line above the civic address,
 * where Canada Post puts additional delivery information. Nothing the
 * customer wrote is dropped.
 *
 * @param {string} [line1]
 * @param {string} [line2]
 * @returns {{ civic: string, extraLines: string[] }}
 */
export function splitCivicAddress(line1, line2) {
  const parts = String(line1 ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (line2 && String(line2).trim()) parts.push(String(line2).trim());
  let civic = parts.shift() || '';

  // "123 Main St #4" — a trailing "#unit" on the street itself.
  const trailing = /^(.*\S)\s+#\s*([A-Z0-9]{1,6})$/i.exec(civic);
  let unit = null;
  if (trailing) { civic = trailing[1]; unit = trailing[2]; }

  const extraLines = [];
  const suffixes = [];
  for (const raw of parts) {
    const p = raw.trim();
    const bare = UNIT_ONLY_RE.exec(p);
    const desig = DESIGNATOR_RE.exec(p);
    if (bare && !unit) unit = bare[1];
    else if (desig) suffixes.push(cleanAddressLine(desig[1]) + ' ' + cleanAddressLine(desig[2]));
    else extraLines.push(cleanAddressLine(p));
  }

  civic = cleanAddressLine(civic);
  if (unit) {
    const u = cleanAddressLine(unit);
    // Only a street that starts with its civic number can take the "4-123"
    // form; otherwise (a rural route, a PO box) the unit reads as UNIT 4.
    if (STARTS_WITH_CIVIC_RE.test(civic) && !HAS_UNIT_PREFIX_RE.test(civic)) civic = `${u}-${civic}`;
    else suffixes.unshift(`UNIT ${u}`);
  }
  if (suffixes.length) civic = [civic, ...suffixes].join(' ');
  return { civic, extraLines: extraLines.filter(Boolean) };
}

const COUNTRY_NAMES = { US: 'UNITED STATES', USA: 'UNITED STATES', 'UNITED STATES OF AMERICA': 'UNITED STATES' };
const nonSpaceLength = (s) => s.replace(/\s/g, '').length;

/**
 * The destination address block of an order, line by line, ready to print —
 * plus what's wrong with it, in the admin's words, so a label with a missing
 * postal code is caught on screen and not at the post office counter.
 *
 * @param {import('../types/order.js').OrderRecord} record
 * @returns {{ lines: string[], problems: string[] }}
 */
export function formatLabelAddress(record) {
  const problems = [];
  const a = record?.shipping?.address || {};
  const name = cleanAddressLine(record?.customer?.name);
  if (!name) problems.push('Missing customer name');

  const { civic, extraLines } = splitCivicAddress(a.line1, a.line2);
  if (!civic) problems.push('Missing street address');

  const city = cleanAddressLine(a.city);
  if (!city) problems.push('Missing city');

  const country = cleanAddressLine(a.country || 'CA');
  const domestic = country === '' || country === 'CA' || country === 'CAN' || country === 'CANADA';

  let prov = domestic ? provinceCode(a.province) : cleanAddressLine(a.province);
  if (domestic && !prov) {
    problems.push(a.province ? `Province not recognized: "${a.province}"` : 'Missing province');
    prov = cleanAddressLine(a.province);
  }

  let postal = domestic ? formatPostalCode(a.postalCode) : cleanAddressLine(a.postalCode);
  if (domestic && !postal) {
    problems.push(a.postalCode ? `Postal code doesn't look Canadian: "${a.postalCode}"` : 'Missing postal code');
    postal = cleanAddressLine(a.postalCode);
  }

  const lines = [name, ...extraLines, civic].filter(Boolean);
  const cityProv = [city, prov].filter(Boolean).join(' ');
  const lastLine = [cityProv, postal].filter(Boolean).join('  ');
  if (postal && cityProv && nonSpaceLength(lastLine) > MAX_LINE_CHARS) {
    lines.push(cityProv, postal); // allowed: postal code alone on the last line
  } else if (lastLine) {
    lines.push(lastLine);
  }
  if (!domestic) lines.push(COUNTRY_NAMES[country] || country);

  if (lines.some((l) => nonSpaceLength(l) > MAX_LINE_CHARS)) {
    problems.push(`A line is longer than ${MAX_LINE_CHARS} characters — check it fits on the label`);
  }
  return { lines, problems };
}

/** The return address, formatted by the same rules as the destination. */
export function returnAddressLines() {
  const { civic } = splitCivicAddress(BUSINESS_ADDRESS.line1);
  return [
    RETURN_NAME,
    civic,
    `${cleanAddressLine(BUSINESS_ADDRESS.city)} ${provinceCode(BUSINESS_ADDRESS.province)}  ${formatPostalCode(BUSINESS_ADDRESS.postalCode)}`,
  ];
}

/**
 * True when an order still has to be mailed: it ships (not pickup), it isn't
 * marked shipped/picked up, and it wasn't refunded. Read from the full order
 * body — orders of any age, via resolveOrderDispatch / isOrderResolved.
 *
 * @param {import('../types/order.js').OrderRecord} record
 */
export function needsShippingLabel(record) {
  if (!record || typeof record !== 'object') return false;
  if (resolveOrderDispatch(record).method === 'pickup') return false;
  return !isOrderResolved(record);
}

/** Sort key: the committed ship-by date first, then the order date — what has to leave soonest comes first. */
function urgencyKey(record) {
  return (record.committedDate || '9999-99-99') + '|' + (record.createdAt || '');
}

/**
 * What the admin reviews before printing: every order that needs labels,
 * soonest first, with its address as it will print and anything wrong with it.
 *
 * @param {Array<import('../types/order.js').OrderRecord>} records
 */
export function describeLabelOrders(records) {
  return records
    .filter(needsShippingLabel)
    .sort((a, b) => urgencyKey(a).localeCompare(urgencyKey(b)))
    .map((record) => {
      const dispatch = resolveOrderDispatch(record);
      const { lines, problems } = formatLabelAddress(record);
      return {
        orderId: record.orderId,
        customerName: record.customer?.name || '',
        createdAt: record.createdAt || null,
        committedDate: record.committedDate || null,
        status: record.production?.status || 'unknown',
        isTest: record.isTest === true,
        method: dispatch.method,
        service: serviceName(dispatch.method),
        // One label per package. An unknown count (no designs on record) still
        // gets one label rather than none.
        packages: dispatch.packages || 1,
        lines,
        problems,
      };
    });
}

/** The Canada Post service, uppercase, as the label prints it. */
export function serviceName(method) {
  return getShippingMethod(method).carrier.replace(/^Canada Post\s+/i, '').toUpperCase();
}

/**
 * Expands reviewed orders into one label per package, in order.
 *
 * @param {ReturnType<typeof describeLabelOrders>} orders
 * @returns {Array<{ orderId: string, packageNumber: number, packageCount: number, service: string, lines: string[] }>}
 */
export function expandLabels(orders) {
  const labels = [];
  for (const o of orders) {
    for (let n = 1; n <= o.packages; n++) {
      labels.push({ orderId: o.orderId, packageNumber: n, packageCount: o.packages, service: o.service, lines: o.lines });
    }
  }
  return labels;
}

/** Small reference line under the note: "EP-4T7K · LETTERMAIL · PKG 2 OF 3". */
export function labelReference(label) {
  const parts = [label.orderId, label.service];
  if (label.packageCount > 1) parts.push(`PKG ${label.packageNumber} OF ${label.packageCount}`);
  return parts.join(' · ');
}

/**
 * Reads the "free spaces on the first sheet" choice; anything else is a new sheet.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeFreeSpaces(value) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return FEEDABLE_FREE_SPACES.includes(n) ? n : LABELS_PER_SHEET;
}

/**
 * How `count` labels land on paper. The first page fills the free spaces of
 * the sheet already in the printer (always from the top); every page after it
 * is a new sheet of four.
 *
 * @param {number} count
 * @param {number} [firstSheetFree]  4, 3 or 2
 * @returns {{ pages: number[], newSheets: number, leftoverSpaces: number, leftoverFeedable: boolean }}
 *   pages: labels on each page, top-down; newSheets: fresh sheets used;
 *   leftoverSpaces: what's still free on the last sheet after cutting;
 *   leftoverFeedable: whether that leftover can go through the printer again.
 */
export function planLabelSheets(count, firstSheetFree = LABELS_PER_SHEET) {
  const first = normalizeFreeSpaces(firstSheetFree);
  const pages = [];
  let remaining = Math.max(0, Math.floor(count));
  let capacity = first;
  let lastCapacity = first;
  while (remaining > 0) {
    const n = Math.min(capacity, remaining);
    pages.push(n);
    lastCapacity = capacity;
    remaining -= n;
    capacity = LABELS_PER_SHEET;
  }
  const newSheets = pages.length === 0 ? 0 : pages.length - (first < LABELS_PER_SHEET ? 1 : 0);
  const leftoverSpaces = pages.length === 0 ? first : lastCapacity - pages[pages.length - 1];
  return { pages, newSheets, leftoverSpaces, leftoverFeedable: FEEDABLE_FREE_SPACES.includes(leftoverSpaces) };
}
