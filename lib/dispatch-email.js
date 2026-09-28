// The shipping email a customer gets when their order has gone out: what was
// shipped, when, how, the tracking number if there is one, and when to expect it.
//
// Pure (no I/O, nothing sent) and free of server-only imports, so the exact same
// functions decide what the admin panel shows, what the preview renders, and what
// goes out. Sending, and the guards around it, live in dispatch-email-send.js.
import { addBusinessDays, formatPackageCount, getShippingMethod, resolveOrderDispatch } from './shipping-config.js';
import { BUSINESS_ADDRESS_ONE_LINE, BUSINESS_PHONE_DISPLAY } from './business-info.js';

// Where replies go (the from address, orders@edibleprint.net, isn't a mailbox),
// and where test mail and owner alerts land when nothing overrides it — the same
// defaults the order-confirmation emails already use.
export const DISPATCH_REPLY_TO = 'edibleprintorders@gmail.com';
export const DEFAULT_OWNER_EMAIL = 'glenj.belmar@gmail.com';
export const DISPATCH_FROM = 'EdiblePrint.net <orders@edibleprint.net>';

const TRACKING_PLACEHOLDER = '(tracking number not recorded yet)';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 'Tuesday, October 13, 2026' for a YYYY-MM-DD calendar date (no timezone shift). */
export function formatLongDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return String(ymd || '');
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Canada Post's public tracking page for a number. */
export function canadaPostTrackingUrl(trackingNumber) {
  return 'https://www.canadapost-postescanada.ca/track-reperage/en#/details/' + encodeURIComponent(String(trackingNumber).replace(/[\s-]/g, ''));
}

/**
 * The latest day the order should arrive: the ship date plus the method's
 * MAXIMUM transport time in business days (weekends and Canada Post holidays
 * don't count). Same window /shipping and /refund promise for a reprint.
 *
 * @param {{ shippingMethod?: string, shipping?: { method?: string } }} record
 * @param {string} shippedAt  YYYY-MM-DD
 */
export function estimatedArrivalDate(record, shippedAt) {
  const { method } = resolveOrderDispatch(record);
  return addBusinessDays(shippedAt, getShippingMethod(method).maxBusinessDays);
}

/**
 * Whether the shipping email can go out for this order, and if not, why — in
 * words the panel shows as they are. Also says whether it has already been sent.
 * The server enforces the same answer, so a button that looks disabled cannot be
 * bypassed by calling the API.
 *
 * @returns {{ canSend: boolean, reason: string | null, sent: null | { at: string, to: string, redirected: boolean, count: number } }}
 */
export function dispatchEmailStatus(record) {
  const n = record?.notifications || {};
  const sent = n.dispatchEmailSentAt
    ? { at: n.dispatchEmailSentAt, to: n.dispatchEmailTo || '', redirected: n.dispatchEmailRedirected === true, count: Number(n.dispatchEmailSendCount) || 1 }
    : null;
  const { method } = resolveOrderDispatch(record);
  const block = (reason) => ({ canSend: false, reason, sent });
  if (method === 'pickup') return block('Pickup orders are not shipped, so there is no shipping email.');
  if (!record?.shippedAt) return block('Save a ship date first: a shipping email needs one.');
  if (method === 'tracked' && !record?.trackingNumber) return block('Record the tracking number first: this customer paid for tracked shipping.');
  // A test order's mail goes to the owner, so it never needs the customer's address.
  if (!record?.isTest && !record?.customer?.email) return block('This order has no customer email, so there is nobody to notify.');
  return { canSend: true, reason: null, sent };
}

/**
 * Who the email really goes to. A TEST order (Stripe test mode) ALWAYS goes to
 * the owner with a [TEST] prefix and never to the customer, whatever address the
 * order carries — a test checkout can't reach a real person.
 *
 * @param {{ isTest?: boolean, customer?: { email?: string } }} record
 * @param {{ ORDER_NOTIFICATION_EMAIL?: string }} [env]
 * @returns {{ to: string | null, redirected: boolean, originalTo: string | null, subjectPrefix: string }}
 */
export function resolveDispatchRecipient(record, env = {}) {
  const customerEmail = record?.customer?.email || null;
  if (record?.isTest) {
    return { to: env.ORDER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL, redirected: true, originalTo: customerEmail, subjectPrefix: '[TEST] ' };
  }
  return { to: customerEmail, redirected: false, originalTo: null, subjectPrefix: '' };
}

/**
 * Builds the email. `preview` lets the panel show it before a ship date or
 * tracking number is saved (today's date / a marked placeholder stand in);
 * without it, a missing date, or a tracked order without its number, throws.
 *
 * @param {object} record  the saved OrderRecord
 * @param {{ recipient?: ReturnType<typeof resolveDispatchRecipient>, siteUrl?: string, preview?: boolean, today?: string }} [opts]
 * @returns {{ subject: string, html: string, text: string, shippedAt: string, estimatedArrival: string, usedPlaceholderDate: boolean }}
 */
export function buildDispatchEmail(record, opts = {}) {
  const { preview = false, today, siteUrl = 'https://edibleprint.net' } = opts;
  const recipient = opts.recipient || resolveDispatchRecipient(record);
  const dispatch = resolveOrderDispatch(record);
  if (dispatch.method === 'pickup') throw new Error('Pickup orders are not shipped');

  const usedPlaceholderDate = !record.shippedAt;
  const shippedAt = record.shippedAt || (preview ? today : null);
  if (!shippedAt) throw new Error('A ship date is required');
  const tracked = dispatch.method === 'tracked';
  if (tracked && !record.trackingNumber && !preview) throw new Error('A tracking number is required for tracked shipping');

  const orderId = record.orderId || record.orderNumber || '';
  const packages = dispatch.packages;
  const several = packages !== null && packages > 1;
  const arrival = estimatedArrivalDate(record, shippedAt);
  const arrivalLong = formatLongDate(arrival);
  const service = getShippingMethod(dispatch.method).label + ' — ' + dispatch.carrier;
  const trackingNumber = record.trackingNumber || (tracked ? TRACKING_PLACEHOLDER : '');
  const trackingUrl = record.trackingNumber ? canadaPostTrackingUrl(record.trackingNumber) : null;
  const firstName = String(record.customer?.name || '').trim().split(/\s+/)[0];
  const greeting = firstName ? 'Hi ' + firstName + ',' : 'Hello,';
  const subject = recipient.subjectPrefix + 'Your EdiblePrint order ' + orderId + ' has shipped';

  // The reprint promise mirrors /refund and /shipping (standardNotArrivedSentence): standard
  // shipping has no tracking, so this is what stands in for it. Only the part that
  // didn't arrive is reprinted.
  const guarantee = tracked ? null
    : several
      ? `If part of your order hasn't arrived by ${arrivalLong}, reply to this email and we'll reprint and resend that part at no cost.`
      : `If you haven't received your order by ${arrivalLong}, reply to this email and we'll reprint it at no cost.`;

  const rows = [
    ['Order', orderId],
    ['Shipped on', formatLongDate(shippedAt)],
    ['Service', service],
    ...(several ? [['Packages', formatPackageCount(packages) + ' — they may arrive on different days']] : []),
    ...(tracked ? [['Tracking number', trackingNumber]] : []),
    ['Expected by', arrivalLong],
  ];

  const testBanner = recipient.redirected
    ? `TEST — this email would have gone to ${recipient.originalTo || 'the customer'}. It was sent to you instead.`
    : null;

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">'
    + (testBanner ? '<div style="background:#F59E0B;color:#fff;padding:10px;text-align:center;font-weight:bold;">⚠️ ' + esc(testBanner) + '</div>' : '')
    + '<div style="background:#1B6B4A;color:#fff;padding:20px;"><h2 style="margin:0;font-size:22px;">Your order has shipped 📦</h2></div>'
    + '<div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;">'
    + '<p style="margin:0 0 12px;font-size:15px;">' + esc(greeting) + '</p>'
    + '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Good news — your EdiblePrint order is on its way.</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px;">'
    + rows.map(([k, v], i) => '<tr style="background:' + (i % 2 ? '#fff' : '#f9fafb') + ';"><td style="padding:9px 14px;color:#6b7280;width:38%;">' + esc(k) + '</td><td style="padding:9px 14px;font-weight:600;">' + esc(v) + '</td></tr>').join('')
    + '</table>'
    + (trackingUrl
      ? '<p style="margin:0 0 18px;"><a href="' + esc(trackingUrl) + '" style="display:inline-block;background:#1B6B4A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">Track your package</a></p>'
      : '')
    + (guarantee
      ? '<p style="margin:0 0 6px;font-size:13.5px;color:#6b7280;">This shipping service does not include a tracking number.</p>'
        + '<p style="margin:0 0 18px;font-size:14px;line-height:1.6;background:#E8F5EE;border-left:4px solid #1B6B4A;padding:12px 14px;">' + esc(guarantee) + '</p>'
      : '')
    + '<p style="margin:0 0 6px;font-size:13.5px;color:#6b7280;">Questions? Reply to this email, contact ' + esc(DISPATCH_REPLY_TO) + ', or text or WhatsApp us at ' + esc(BUSINESS_PHONE_DISPLAY) + '.</p>'
    + '<p style="margin:0;font-size:13px;"><a href="' + esc(siteUrl + '/shipping') + '" style="color:#1B6B4A;">Shipping policy</a></p>'
    + '</div>'
    + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:8px 0 0;line-height:1.6;">EdiblePrint.net — ' + esc(BUSINESS_ADDRESS_ONE_LINE) + '</p>'
    + '</div>';

  const text = (testBanner ? testBanner + '\n\n' : '')
    + greeting + '\n\nGood news — your EdiblePrint order is on its way.\n\n'
    + rows.map(([k, v]) => k + ': ' + v).join('\n') + '\n\n'
    + (trackingUrl ? 'Track your package: ' + trackingUrl + '\n\n' : '')
    + (guarantee ? 'This shipping service does not include a tracking number.\n' + guarantee + '\n\n' : '')
    + 'Questions? Reply to this email, contact ' + DISPATCH_REPLY_TO + ', or text or WhatsApp us at ' + BUSINESS_PHONE_DISPLAY + '.\n'
    + 'Shipping policy: ' + siteUrl + '/shipping\n\n'
    + 'EdiblePrint.net — ' + BUSINESS_ADDRESS_ONE_LINE + '\n';

  return { subject, html, text, shippedAt, estimatedArrival: arrival, usedPlaceholderDate };
}
