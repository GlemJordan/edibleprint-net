// Shared filename convention for every downloadable PDF (production slip,
// print-ready files, and the standalone $3.99 digital download): purchase
// date in ddmmyy + the customer's name, e.g. "190826-Maria-Gonzalez.pdf".
// Falls back to an order identifier when there's no customer name to use.
// Pure/isomorphic -- imported from both client components (app/page.js,
// app/download-pdf/page.js) and server routes, so the two can't drift into
// computing the name differently for the same download.

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// Unicode combining-diacritical-marks block left behind by NFD
// normalization (e.g. "González" -> "Gonza" + U+0301) -- stripping this
// range is what turns an accented name into its plain-ASCII equivalent.
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

/**
 * Strips accents, Windows-invalid characters (< > : " / \ | ? * and control
 * chars), and collapses whitespace into hyphens, so the result is always
 * safe to use as a Windows (or any OS) filename segment.
 * @param {string} input
 * @returns {string} sanitized segment, or '' if nothing usable remains
 */
export function sanitizeFilenamePart(input) {
  let s = String(input ?? '')
    .normalize('NFD').replace(COMBINING_MARKS_RE, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  if (WINDOWS_RESERVED_NAMES.has(s.toUpperCase())) s = s + '_';
  return s;
}

/**
 * @param {string|number|Date} dateInput
 * @returns {string} ddmmyy, e.g. '190826', in the business's own timezone
 * (same America/Toronto convention lib/generate-pdf.js uses for the slip's
 * printed date) so the filename date can't disagree with the date printed
 * inside the PDF.
 */
export function formatPurchaseDateDDMMYY(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', day: '2-digit', month: '2-digit', year: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('day')}${get('month')}${get('year')}`;
}

/**
 * @param {string} sessionId  Stripe checkout session id
 * @returns {string} 'EP-XXXXXXXX', the same convention app/api/webhook/
 * route.js uses for real orders' orderNumber -- used here only as a
 * stand-in label for standalone digital-download purchases, which never
 * get an order record of their own.
 */
export function orderNumberFromSessionId(sessionId) {
  if (!sessionId) return 'order';
  return 'EP-' + sessionId.slice(-8).toUpperCase();
}

/**
 * @param {{ purchaseDate: string|number|Date, customerName?: string, fallbackId?: string }} params
 * @returns {string} e.g. '190826-Maria-Gonzalez.pdf' or '190826-EP-A3B4C5D6.pdf'
 */
export function buildPdfFilename({ purchaseDate, customerName, fallbackId }) {
  const datePart = formatPurchaseDateDDMMYY(purchaseDate ?? Date.now());
  const namePart = sanitizeFilenamePart(customerName) || sanitizeFilenamePart(fallbackId) || 'order';
  return `${datePart}-${namePart}.pdf`;
}
