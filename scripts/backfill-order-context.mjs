// One-time migration: attaches Cloudinary Search context to order.json
// resources saved before that context existed (orders from before the
// admin order-list feature — see lib/order-record.js's saveOrderRecord).
// Without this, GET /api/admin/orders shows those orders as "—"/"unknown"
// in every column, since it reads context only and never fetches the full
// order.json body for every order (see lib/cloudinary-ops.js searchOrders).
//
// Uses deriveSearchContext() from lib/order-record.js — the SAME function
// saveOrderRecord() calls for new orders — so a migrated order's context
// can never come out shaped differently from a freshly-saved one.
//
// Does NOT touch the missingAssets flag: that field never existed for these
// orders (it was added even later than context itself), and computing it
// would require actually checking whether production-slip.pdf/print-ready
// PDFs exist in Cloudinary for each one — a different, separate check. The
// admin order list already treats an absent missingAssets as "not flagged",
// which is the correct default here (these orders' pipeline was working
// fine at the time; there's no evidence otherwise).
//
// Usage:
//   node --env-file=.env.local scripts/backfill-order-context.mjs            (dry run — reports only, no writes)
//   node --env-file=.env.local scripts/backfill-order-context.mjs --apply    (writes for real)

import { searchOrders, fetchRawText, updateResourceContext } from '../lib/cloudinary-ops.js';
import { deriveSearchContext } from '../lib/order-record.js';

const ORDER_PUBLIC_ID_RE = /^edibleprint\/orders\/([^/]+)\/order$/;
const APPLY = process.argv.includes('--apply');

async function findOrdersMissingContext() {
  const targets = [];
  let cursor;
  do {
    const res = await searchOrders({ maxResults: 100, nextCursor: cursor });
    for (const r of res.resources || []) {
      const m = ORDER_PUBLIC_ID_RE.exec(r.public_id || '');
      if (!m) continue;
      const ctx = r.context?.custom || r.context || {};
      if (Object.keys(ctx).length === 0) {
        targets.push({ orderId: m[1], publicId: r.public_id });
      }
    }
    cursor = res.next_cursor || null;
  } while (cursor);
  return targets;
}

(async () => {
  console.log(APPLY ? '=== APPLY MODE — writing context for real ===\n' : '=== DRY RUN — no writes will be made ===\n');

  const targets = await findOrdersMissingContext();
  console.log(`Found ${targets.length} order(s) missing context.\n`);

  const results = [];
  for (const { orderId, publicId } of targets) {
    try {
      const text = await fetchRawText(publicId);
      const record = JSON.parse(text);
      const context = deriveSearchContext(record);
      results.push({ orderId, publicId, context, ok: true });
      if (APPLY) {
        await updateResourceContext(publicId, context);
      }
    } catch (err) {
      results.push({ orderId, publicId, ok: false, error: err.message });
    }
  }

  console.log('--- Report ---\n');
  for (const r of results) {
    if (r.ok) {
      console.log(`${r.orderId}`);
      console.log(`  customerName:    ${JSON.stringify(r.context.customerName)}`);
      console.log(`  total:           ${r.context.total}`);
      console.log(`  status:          ${r.context.status}`);
      console.log(`  hasUploadDesign: ${r.context.hasUploadDesign}`);
      console.log(`  designCount:     ${r.context.designCount}`);
      console.log(`  createdAt:       ${r.context.createdAt}`);
      console.log('');
    } else {
      console.log(`${r.orderId}: SKIPPED — ${r.error}\n`);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${ok} order(s) ${APPLY ? 'migrated' : 'would be migrated'}, ${failed} skipped due to errors.`);
  if (!APPLY && ok > 0) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply to write these values for real.');
  }
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
})();
