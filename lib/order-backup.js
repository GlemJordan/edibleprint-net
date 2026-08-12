import { searchOrders, fetchRawText, orderFolderPath, uploadRaw } from './cloudinary-ops.js';
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

// Where "when was the last backup actually SENT" lives — a raw JSON resource
// alongside the orders themselves, same storage/pattern as everything else
// in this project (no DB, no KV). Read via fetchRawText, written via
// uploadRaw, exactly like an order.json.
const BACKUP_STATE_PUBLIC_ID = 'edibleprint/system/orders-backup-state';

/**
 * @returns {Promise<{ lastBackupAt: string } | null>} null if no backup has
 *   ever been sent (first run) — every order is then treated as "new".
 */
async function loadBackupState() {
  try {
    return JSON.parse(await fetchRawText(BACKUP_STATE_PUBLIC_ID));
  } catch (err) {
    if (/404/.test(err.message)) return null;
    throw err;
  }
}

async function saveBackupState(state) {
  await uploadRaw(JSON.stringify(state, null, 2), BACKUP_STATE_PUBLIC_ID);
}

/**
 * An order counts as "new since last backup" if it was created after the
 * last backup was sent, OR its production status changed since then
 * (production.updatedAt is the only other timestamp an order carries) —
 * either way, this backup's copy of it differs from what already went out.
 */
function isNewSinceLastBackup(record, lastBackupAt) {
  if (!lastBackupAt) return true;
  if (new Date(record.createdAt) > lastBackupAt) return true;
  const updatedAt = record.production?.updatedAt;
  return !!(updatedAt && new Date(updatedAt) > lastBackupAt);
}

function csvField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_COLUMNS = [
  ['orderId', (r) => r.orderId],
  ['orderNumber', (r) => r.orderNumber],
  ['createdAt', (r) => r.createdAt],
  ['saleDate', (r) => r.saleDate || r.createdAt],
  ['isTest', (r) => r.isTest],
  // Absent on any order saved before these existed — read as 'stripe' /
  // 'website' / 'stripe_card', matching deriveSearchContext()'s defaults,
  // so an old row can't show blank where it should show what it really was.
  ['source', (r) => r.source || 'stripe'],
  ['channel', (r) => r.channel || 'website'],
  ['paymentMethod', (r) => r.payment?.method || 'stripe_card'],
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
 * PDF candidates are further restricted to orders CREATED since the last
 * backup was sent (`lastBackupAt`) — a still-unprinted older order was
 * already a candidate in some earlier backup (attached, or explicitly left
 * out for size, per that run's own summary), so re-considering it here would
 * either repeat an attachment already sent or repeat the same size miss
 * forever. `lastBackupAt` null (first-ever backup) means every unprinted
 * order is a candidate, matching the pre-existing behavior.
 *
 * @param {Array<import('../types/order.js').OrderRecord>} records
 * @param {Date | null} lastBackupAt
 * @returns {Promise<{
 *   files: Array<{filename: string, content: Buffer}>,
 *   attachedOrderIds: string[],
 *   excludedForSizeOrderIds: string[],
 *   noFileAvailableOrderIds: string[],
 *   totalBytes: number,
 * }>}
 */
export async function selectPrintFilesForBackup(records, lastBackupAt) {
  const unprinted = records
    .filter((r) => UNPRINTED_STATUSES.includes(r.production?.status))
    .filter((r) => !lastBackupAt || new Date(r.createdAt) > lastBackupAt)
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
 * at the top of the backup email — deliberately just these three facts so
 * the owner can glance at it without wading through a per-order breakdown.
 */
function buildSummary(records, newCount) {
  const oldest = records[0]?.createdAt;
  const newest = records[records.length - 1]?.createdAt;
  return [
    `Total orders: ${records.length}`,
    `New since last backup: ${newCount}`,
    `Date range: ${fmtDate(oldest)} to ${fmtDate(newest)}`,
  ];
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Generates the CSV + JSON + (budget-permitting) print-ready PDFs for every
 * unprinted order created since the last backup, and emails it all to the
 * owner — but only if there's actually something new or changed since then;
 * an identical re-send of last week's data is pure noise. This is the ONE
 * place that builds and sends the backup — both the weekly cron and,
 * indirectly, anyone re-running it by hand call this, so there's exactly one
 * definition of what "the backup" contains.
 *
 * @returns {Promise<{ skipped: boolean, ordersBackedUp: number, newOrders: number, pdfsAttached?: number, excludedForSize?: number }>}
 */
export async function sendOrderBackupEmail() {
  const state = await loadBackupState();
  const lastBackupAt = state?.lastBackupAt ? new Date(state.lastBackupAt) : null;

  const records = await fetchAllOrderRecords();
  const newCount = records.filter((r) => isNewSinceLastBackup(r, lastBackupAt)).length;

  if (lastBackupAt && newCount === 0) {
    return { skipped: true, ordersBackedUp: records.length, newOrders: 0 };
  }

  const csv = buildBackupCsv(records);
  const json = buildBackupJson(records);
  const selection = await selectPrintFilesForBackup(records, lastBackupAt);
  const summaryLines = buildSummary(records, newCount);
  const today = new Date().toISOString().slice(0, 10);

  const attachments = [
    { filename: `edibleprint-orders-backup-${today}.csv`, content: Buffer.from(csv).toString('base64') },
    { filename: `edibleprint-orders-backup-${today}.json`, content: Buffer.from(json).toString('base64') },
    ...selection.files.map((f) => ({ filename: f.filename, content: f.content.toString('base64') })),
  ];

  const subject = '[CONFIDENTIAL — customer data] Orders backup — '
    + newCount + ' new order' + (newCount === 1 ? '' : 's');

  const html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">'
    + '<div style="background:#DC2626;color:white;padding:14px 20px;font-weight:bold;font-size:15px;">'
    + '🔒 CONFIDENTIAL — contains customer names, emails, phone numbers, and addresses. Handle and store this email accordingly.'
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;">'
    + '<h2 style="color:#1B6B4A;margin-top:0;">Orders Backup — ' + today + '</h2>'
    + '<ul style="font-size:14px;color:#374151;line-height:1.8;">'
    + summaryLines.map((l) => '<li>' + l + '</li>').join('')
    + '</ul>'
    + '</div></div>';

  const text = '🔒 CONFIDENTIAL — contains customer names, emails, phone numbers, and addresses. Handle and store this email accordingly.\n\n'
    + 'Orders Backup — ' + today + '\n\n'
    + summaryLines.join('\n');

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
        attachments,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Backup email HTTP ' + res.status + ': ' + body);
    }
  }, 'orderBackupEmail');

  await saveBackupState({ lastBackupAt: new Date().toISOString() });

  return {
    skipped: false,
    ordersBackedUp: records.length,
    newOrders: newCount,
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
