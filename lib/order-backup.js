import { searchOrders, fetchRawText, orderFolderPath } from './cloudinary-ops.js';
import { resolvePrintReadyUrls } from './order-record.js';
import { withRetry } from './with-retry.js';

// Same strict shape check GET /api/admin/orders uses — Cloudinary's Search
// expression is a coarse pre-filter that also returns each order's own
// sibling files (production-slip.pdf, print-design.pdf, notes) and unrelated
// resources, so this regex is the real source of truth for "is this an
// order.json".
const ORDER_PUBLIC_ID_RE = /^edibleprint\/orders\/([^/]+)\/order$/;
const MAX_PAGES = 20;

// A pedido's print-ready file(s) are only irreplaceable while the physical
// print hasn't happened yet — once printed, losing the digital copy doesn't
// stop the order from having been fulfilled. See lib/order-pdf-pipeline.js:
// production-slip.pdf is always regenerable from order.json alone (no
// external asset dependency), so it's deliberately NOT part of this backup —
// only the print-ready PDF(s), which DO depend on Cloudinary-hosted source
// images and can't be rebuilt if Cloudinary itself is the thing that failed.
const UNPRINTED_STATUSES = ['paid', 'file_received', 'ready_to_print'];

// Raw-byte budget for PDF attachments, well under Resend's ~29MB raw-
// equivalent cap (40MB stated limit is measured AFTER base64 encoding,
// which inflates size by ~33%) — leaves headroom for the CSV/JSON and email
// body on top. At this business's real average print-ready size (~536KB per
// order, audited directly against production Cloudinary data), this budget
// covers roughly 35+ concurrent unprinted orders before anything gets
// dropped — far beyond any backlog this business has had.
const PDF_ATTACHMENT_BUDGET_BYTES = 20 * 1024 * 1024;

/**
 * Fetches every order's FULL order.json body (not just the light `context`
 * metadata the admin list uses) — this backup exists specifically because
 * context alone can't reconstruct a pedido. Sorted oldest-first, which both
 * the CSV/JSON output and the PDF-selection logic below rely on.
 *
 * @returns {Promise<Array<import('../types/order.js').OrderRecord>>}
 */
export async function fetchAllOrderRecords() {
  const orderIds = [];
  let cursor;
  let pagesFetched = 0;
  do {
    const result = await searchOrders({ maxResults: 100, nextCursor: cursor });
    pagesFetched++;
    for (const r of result.resources || []) {
      const match = ORDER_PUBLIC_ID_RE.exec(r.public_id || '');
      if (match) orderIds.push(match[1]);
    }
    cursor = result.next_cursor || null;
  } while (cursor && pagesFetched < MAX_PAGES);

  const records = [];
  for (const orderId of orderIds) {
    try {
      const text = await fetchRawText(`${orderFolderPath(orderId)}/order`);
      records.push(JSON.parse(text));
    } catch (err) {
      // One unreadable order.json must not take down the whole backup —
      // the rest of the pedidos still need to make it into the file.
      console.error(`[order-backup] failed to fetch ${orderId} for backup:`, err.message);
    }
  }
  records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return records;
}

function csvField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_COLUMNS = [
  ['orderId', (r) => r.orderId],
  ['orderNumber', (r) => r.orderNumber],
  ['createdAt', (r) => r.createdAt],
  ['isTest', (r) => r.isTest],
  ['customerName', (r) => r.customer?.name],
  ['customerEmail', (r) => r.customer?.email],
  ['customerPhone', (r) => r.customer?.phone],
  ['shippingMethod', (r) => r.shipping?.method],
  ['shippingLabel', (r) => r.shipping?.label],
  ['shippingLine1', (r) => r.shipping?.address?.line1],
  ['shippingLine2', (r) => r.shipping?.address?.line2],
  ['shippingCity', (r) => r.shipping?.address?.city],
  ['shippingProvince', (r) => r.shipping?.address?.province],
  ['shippingPostalCode', (r) => r.shipping?.address?.postalCode],
  ['shippingCountry', (r) => r.shipping?.address?.country],
  ['designCount', (r) => r.designs?.length || 0],
  ['designsSummary', (r) => (r.designs || [])
    .map((d) => `${d.shapeLabel || d.shape} ${d.size} x${d.quantity} ($${d.unitPrice}) [${d.imageUrl || 'no image'}]`)
    .join(' | ')],
  ['amountCAD', (r) => r.payment?.amountCents != null ? (r.payment.amountCents / 100).toFixed(2) : ''],
  ['currency', (r) => r.payment?.currency],
  ['paymentStatus', (r) => r.payment?.status],
  ['stripeSessionId', (r) => r.payment?.stripeSessionId],
  ['stripePaymentIntentId', (r) => r.payment?.stripePaymentIntentId],
  ['productionStatus', (r) => r.production?.status],
  ['productionUpdatedAt', (r) => r.production?.updatedAt],
  ['adminNote', (r) => r.production?.adminNote],
  ['notes', (r) => r.notes],
  ['urgentFlags', (r) => (r.urgentFlags || []).join(', ')],
  ['orderJsonUrl', (r) => r.assets?.orderJsonUrl],
  ['productionSlipUrl', (r) => r.assets?.productionSlipUrl],
  ['printReadyUrls', (r) => (r.assets?.printReadyUrls || []).map((p) => p.url).join(' | ')],
  ['ownerEmailSent', (r) => r.notifications?.ownerEmailSent],
  ['customerEmailSent', (r) => r.notifications?.customerEmailSent],
  ['customerEmailError', (r) => r.notifications?.customerEmailError],
];

/**
 * Flattened, Excel-openable CSV — one row per order. The JSON export below
 * is the actually-complete/restorable copy (nested designs, full shipping
 * object); this is the human-skimmable companion.
 *
 * @param {Array<import('../types/order.js').OrderRecord>} records
 * @returns {string}
 */
export function buildBackupCsv(records) {
  const header = CSV_COLUMNS.map(([label]) => csvField(label)).join(',');
  const rows = records.map((r) => CSV_COLUMNS.map(([, get]) => csvField(get(r))).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}

/**
 * Full, restorable copy — every field of every OrderRecord, unflattened.
 * To restore a pedido from this file: take the object for that orderId and
 * re-upload it as-is via uploadRaw() to `edibleprint/orders/{orderId}/order`
 * (see lib/order-record.js) — same shape Cloudinary already expects.
 *
 * @param {Array<import('../types/order.js').OrderRecord>} records
 * @returns {string}
 */
export function buildBackupJson(records) {
  return JSON.stringify(records, null, 2);
}

function sanitizeForFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Picks which unprinted pedidos' print-ready PDFs fit in the email's size
 * budget, oldest-first (the ones that have been waiting longest are the
 * ones most at risk of being forgotten, so they get first claim on the
 * budget). A pedido's files are only fetched — and only ever included —
 * as a whole unit; this never attaches part of an order's designs and
 * skips the rest. If an older order's files don't fit, later (smaller)
 * orders are still tried against the remaining budget rather than the
 * whole selection stopping at the first miss, so the budget is used as
 * fully as possible without breaking oldest-first priority for who gets
 * first claim.
 *
 * @param {Array<import('../types/order.js').OrderRecord>} records
 * @returns {Promise<{
 *   files: Array<{filename: string, content: Buffer}>,
 *   attachedOrderIds: string[],
 *   excludedForSizeOrderIds: string[],
 *   noFileAvailableOrderIds: string[],
 *   totalBytes: number,
 * }>}
 */
export async function selectPrintFilesForBackup(records) {
  const unprinted = records
    .filter((r) => UNPRINTED_STATUSES.includes(r.production?.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const files = [];
  const attachedOrderIds = [];
  const excludedForSizeOrderIds = [];
  const noFileAvailableOrderIds = [];
  let totalBytes = 0;

  for (const record of unprinted) {
    // resolvePrintReadyUrls falls back to a live Cloudinary listing when
    // order.json's own assets.printReadyUrls is missing/stale — same
    // fallback the admin order detail page uses (see lib/order-record.js),
    // so both places agree on what's actually recoverable for an order.
    const urls = await resolvePrintReadyUrls(record);
    if (urls.length === 0) {
      noFileAvailableOrderIds.push(record.orderId);
      continue;
    }

    let orderBytes = 0;
    const orderFiles = [];
    try {
      for (const p of urls) {
        const buf = await withRetry(async () => {
          const res = await fetch(p.url);
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${p.url}`);
          return Buffer.from(await res.arrayBuffer());
        }, 'backupFetchPrintFile:' + record.orderId);
        orderBytes += buf.length;
        orderFiles.push({
          filename: `${record.orderId}_${sanitizeForFilename(p.label || 'print')}.pdf`,
          content: buf,
        });
      }
    } catch (err) {
      console.error(`[order-backup] failed to fetch print files for ${record.orderId}:`, err.message);
      noFileAvailableOrderIds.push(record.orderId);
      continue;
    }

    if (totalBytes + orderBytes > PDF_ATTACHMENT_BUDGET_BYTES) {
      excludedForSizeOrderIds.push(record.orderId);
      continue;
    }
    totalBytes += orderBytes;
    attachedOrderIds.push(record.orderId);
    files.push(...orderFiles);
  }

  return { files, attachedOrderIds, excludedForSizeOrderIds, noFileAvailableOrderIds, totalBytes };
}

function fmtDate(iso) {
  if (!iso) return 'unknown date';
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return iso; }
}

/**
 * Builds the "read this without opening any attachment" summary that goes
 * at the top of the backup email — required so the owner can sanity-check
 * coverage at a glance instead of having to open the JSON.
 */
function buildSummary(records, selection) {
  const printedCount = records.length
    - selection.attachedOrderIds.length
    - selection.excludedForSizeOrderIds.length
    - selection.noFileAvailableOrderIds.length;
  const oldest = records[0]?.createdAt;
  const newest = records[records.length - 1]?.createdAt;

  const lines = [
    `Total orders in this backup: ${records.length}`,
    `Date range: ${fmtDate(oldest)} to ${fmtDate(newest)}`,
    '',
    `Print-ready PDF attached (not yet printed): ${selection.attachedOrderIds.length}${selection.attachedOrderIds.length ? ' — ' + selection.attachedOrderIds.join(', ') : ''}`,
    `No PDF needed (already printed): ${printedCount}`,
  ];
  if (selection.noFileAvailableOrderIds.length) {
    lines.push(`No print file on record (not yet printed, but nothing to attach): ${selection.noFileAvailableOrderIds.length} — ${selection.noFileAvailableOrderIds.join(', ')}`);
  }
  if (selection.excludedForSizeOrderIds.length) {
    lines.push(`⚠ Left out for size (download manually from the admin order page): ${selection.excludedForSizeOrderIds.length} — ${selection.excludedForSizeOrderIds.join(', ')}`);
  }
  return lines;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Generates the CSV + JSON + (budget-permitting) print-ready PDFs for every
 * unprinted order, and emails it all to the owner. This is the ONE place
 * that builds and sends the backup — both the daily cron and, indirectly,
 * anyone re-running it by hand call this, so there's exactly one definition
 * of what "the backup" contains.
 *
 * @returns {Promise<{ ordersBackedUp: number, pdfsAttached: number, excludedForSize: number }>}
 */
export async function sendOrderBackupEmail() {
  const records = await fetchAllOrderRecords();
  const csv = buildBackupCsv(records);
  const json = buildBackupJson(records);
  const selection = await selectPrintFilesForBackup(records);
  const summaryLines = buildSummary(records, selection);
  const today = new Date().toISOString().slice(0, 10);

  const attachments = [
    { filename: `edibleprint-orders-backup-${today}.csv`, content: Buffer.from(csv).toString('base64') },
    { filename: `edibleprint-orders-backup-${today}.json`, content: Buffer.from(json).toString('base64') },
    ...selection.files.map((f) => ({ filename: f.filename, content: f.content.toString('base64') })),
  ];

  const html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">'
    + '<div style="background:#DC2626;color:white;padding:14px 20px;font-weight:bold;font-size:15px;">'
    + '🔒 CONFIDENTIAL — contains customer names, emails, phone numbers, and addresses. Handle and store this email accordingly.'
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;">'
    + '<h2 style="color:#1B6B4A;margin-top:0;">Daily Orders Backup — ' + today + '</h2>'
    + '<ul style="font-size:14px;color:#374151;line-height:1.8;">'
    + summaryLines.filter(Boolean).map((l) => '<li>' + l + '</li>').join('')
    + '</ul>'
    + '<p style="font-size:13px;color:#6b7280;">Attached: a CSV (opens in Excel) and a full JSON copy of every order — the JSON is the restorable copy if Cloudinary is ever lost or corrupted. Print-ready PDFs for not-yet-printed orders are attached individually where they fit within this email\'s size budget.</p>'
    + '</div></div>';

  const text = '🔒 CONFIDENTIAL — contains customer names, emails, phone numbers, and addresses. Handle and store this email accordingly.\n\n'
    + 'Daily Orders Backup — ' + today + '\n\n'
    + summaryLines.join('\n') + '\n\n'
    + 'Attached: a CSV (opens in Excel) and a full JSON copy of every order — the JSON is the restorable copy if Cloudinary is ever lost or corrupted. '
    + 'Print-ready PDFs for not-yet-printed orders are attached individually where they fit within this email\'s size budget.';

  await withRetry(async () => {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com'],
        subject: '[CONFIDENTIAL — customer data] Orders backup — ' + today + ' (' + records.length + ' orders)',
        html,
        text,
        attachments,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Backup email HTTP ' + res.status + ': ' + body);
    }
  }, 'orderBackupEmail');

  return {
    ordersBackedUp: records.length,
    pdfsAttached: selection.files.length,
    excludedForSize: selection.excludedForSizeOrderIds.length,
  };
}

/**
 * Sent when sendOrderBackupEmail() itself fails (generation or delivery) —
 * this is what makes a failed backup visible instead of silent. Deliberately
 * NOT gated on the backup succeeding first; if Resend is down for the real
 * backup, it's very likely also down for this alert, so Vercel's own cron
 * execution log (dashboard, and failure notifications if enabled on the
 * project) is the backstop layer described to the user when this was
 * proposed.
 *
 * @param {Error} err
 */
export async function sendBackupFailedAlert(err) {
  const errorMsg = String(err?.message || err).slice(0, 500);
  try {
    await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com', 'edibleprintorders@gmail.com'],
        subject: '⚠️ Orders BACKUP FAILED — ' + new Date().toISOString().slice(0, 10),
        html: '<p><strong>Today\'s automatic orders backup failed to generate or send.</strong></p>'
          + '<p>Error: ' + errorMsg + '</p>'
          + '<p>Consider running the manual export from the admin Orders page (Export CSV / Export JSON) until this is resolved.</p>',
        text: 'Today\'s automatic orders backup failed to generate or send.\n\n'
          + 'Error: ' + errorMsg + '\n\n'
          + 'Consider running the manual export from the admin Orders page (Export CSV / Export JSON) until this is resolved.',
      }),
    });
  } catch (e) {
    console.error('[order-backup] backup-failed alert itself failed to send:', e.message);
  }
}
