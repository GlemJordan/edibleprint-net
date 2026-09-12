// Daily "delivery dates need attention" digest — the thing that makes
// CAMBIO 1/2's committedDate field actually protect the business even on a
// day nobody opens the admin panel. Reuses the exact same cron-auth +
// raw-Resend-fetch mechanism as the weekly orders backup (lib/order-backup.js)
// rather than inventing a second way to send admin email.
import { fetchAllOrderRecords } from './order-backup.js';
import { computeUrgency, needsDigestMention, URGENCY_LABELS, URGENCY_COLORS } from './delivery-urgency.js';
import { withRetry } from './with-retry.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';
const URGENCY_ORDER = { overdue: 0, today: 1, tomorrow: 2 };

function orderDetailUrl(orderId) {
  return `${SITE_URL}/admin/orders/${orderId}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function rowHtml({ record, urgency }) {
  const isPickup = record.shipping?.method === 'pickup';
  const url = orderDetailUrl(record.orderId);
  const cells = [
    `<span style="display:inline-block;font-size:11px;font-weight:700;color:#fff;background:${URGENCY_COLORS[urgency]};padding:2px 7px;border-radius:4px;">${URGENCY_LABELS[urgency].toUpperCase()}</span>`,
    `<a href="${url}" style="color:#1B6B4A;font-weight:600;text-decoration:none;">${escapeHtml(record.orderId)}</a>`,
    escapeHtml(record.customer?.name || '—'),
    isPickup ? 'Pickup' : 'Ship by',
    escapeHtml(record.committedDate),
    escapeHtml(record.production?.status || '—'),
  ];
  return '<tr>' + cells.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${c}</td>`).join('') + '</tr>';
}

function rowText({ record, urgency }) {
  const isPickup = record.shipping?.method === 'pickup';
  return `[${URGENCY_LABELS[urgency].toUpperCase()}] ${record.orderId} — ${record.customer?.name || '—'} — `
    + `${isPickup ? 'Pickup' : 'Ship by'} ${record.committedDate} — ${record.production?.status || '—'}\n${orderDetailUrl(record.orderId)}`;
}

/**
 * Sends the daily digest of orders whose committedDate is overdue, today, or
 * tomorrow — but ONLY if there's at least one, so a quiet day sends nothing
 * (unlike the weekly backup, this is NOT gated on "changed since last send":
 * an order that's still overdue tomorrow should be mentioned again tomorrow,
 * not just once).
 *
 * @returns {Promise<{ skipped: boolean, flagged: number, overdue?: number, today?: number, tomorrow?: number }>}
 */
export async function sendDeliveryAlertsEmail() {
  const records = await fetchAllOrderRecords();
  const flagged = records
    .map((record) => ({ record, urgency: computeUrgency(record) }))
    .filter(({ urgency }) => needsDigestMention(urgency))
    .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.record.committedDate.localeCompare(b.record.committedDate));

  if (flagged.length === 0) {
    return { skipped: true, flagged: 0 };
  }

  const counts = { overdue: 0, today: 0, tomorrow: 0 };
  flagged.forEach(({ urgency }) => counts[urgency]++);

  const subjectParts = [];
  if (counts.overdue) subjectParts.push(`${counts.overdue} overdue`);
  if (counts.today) subjectParts.push(`${counts.today} due today`);
  if (counts.tomorrow) subjectParts.push(`${counts.tomorrow} due tomorrow`);
  const subject = `📦 Delivery dates need attention — ${subjectParts.join(', ')}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const html = '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">'
    + '<div style="background:#1B6B4A;color:#fff;padding:16px 20px;">'
    + `<h2 style="margin:0;font-size:17px;">📦 Delivery dates need attention — ${todayStr}</h2>`
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;">'
    + `<p style="font-size:14px;color:#374151;margin-top:0;">${flagged.length} order${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} a look: ${subjectParts.join(', ')}.</p>`
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="text-align:left;background:#F9FAFB;">'
    + ['', 'Order', 'Customer', 'Type', 'Date', 'Production'].map((h) => `<th style="padding:8px 10px;font-size:12px;color:#6B7280;">${h}</th>`).join('')
    + '</tr></thead><tbody>'
    + flagged.map(rowHtml).join('')
    + '</tbody></table>'
    + '</div></div>';

  const text = `Delivery dates need attention — ${todayStr}\n\n`
    + flagged.map(rowText).join('\n\n');

  await withRetry(async () => {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com'],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Delivery alerts email HTTP ' + res.status + ': ' + body);
    }
  }, 'deliveryAlertsEmail');

  return { skipped: false, flagged: flagged.length, ...counts };
}

/**
 * Sent when sendDeliveryAlertsEmail() itself throws — same "make a failed
 * cron run visible instead of silent" reasoning as
 * lib/order-backup.js's sendBackupFailedAlert(), which this mirrors.
 *
 * @param {Error} err
 */
export async function sendDeliveryAlertsFailedAlert(err) {
  const errorMsg = String(err?.message || err).slice(0, 500);
  try {
    await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com', 'edibleprintorders@gmail.com'],
        subject: '⚠️ Delivery-date alert email FAILED — ' + new Date().toISOString().slice(0, 10),
        html: '<p><strong>Today\'s automatic delivery-date alert check failed to run or send.</strong></p>'
          + '<p>Error: ' + escapeHtml(errorMsg) + '</p>'
          + '<p>Check the admin Orders page directly (sort/filter by "Needs attention") until this is resolved.</p>',
        text: 'Today\'s automatic delivery-date alert check failed to run or send.\n\n'
          + 'Error: ' + errorMsg + '\n\n'
          + 'Check the admin Orders page directly ("Needs attention" filter) until this is resolved.',
      }),
    });
  } catch (e) {
    console.error('[delivery-alerts] failure alert itself also failed to send:', e.message);
  }
}
