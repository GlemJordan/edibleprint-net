// One-time migration: writes assets.printReadyUrls onto order.json records
// where it's missing/empty but the print-ready PDF actually exists in
// Cloudinary — found while building the orders backup (lib/order-backup.js)
// and fixing the admin order detail page (app/api/admin/orders/[id]/route.js),
// both of which now paper over this at read time via
// resolvePrintReadyUrls() (lib/order-record.js). This migration removes the
// need for that fallback to fire on every read for these specific orders by
// making order.json correct again at the source — this script IS what
// resolvePrintReadyUrls() already computes, just persisted.
//
// Only ever WRITES assets.printReadyUrls, and only when it finds strictly
// MORE entries than order.json already has — an order.json that already has
// N entries recorded is left completely untouched, never compared for
// content, never shrunk. Also only touches `assets`; every other field on
// the record is written back byte-for-byte as fetched, same technique
// updateOrderStatus() already uses elsewhere in lib/order-record.js.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-print-ready-urls.mjs            (dry run — reports only, no writes)
//   node --env-file=.env.local scripts/backfill-print-ready-urls.mjs --apply    (writes for real)

import { uploadRaw, orderFolderPath, fetchRawText } from '../lib/cloudinary-ops.js';
import { fetchAllOrderRecords } from '../lib/order-backup.js';
import { resolvePrintReadyUrls } from '../lib/order-record.js';

const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '=== APPLY MODE — writing order.json for real ===\n' : '=== DRY RUN — no writes will be made ===\n');

  const records = await fetchAllOrderRecords();
  console.log(`Scanned ${records.length} order(s).\n`);

  const results = [];
  for (const record of records) {
    const existing = record.assets?.printReadyUrls || [];
    const resolved = await resolvePrintReadyUrls(record);

    if (resolved.length <= existing.length) {
      results.push({
        orderId: record.orderId,
        action: 'skip',
        reason: existing.length > 0 ? 'already populated' : 'no print-ready file found in Cloudinary',
      });
      continue;
    }

    const result = { orderId: record.orderId, action: 'backfill', before: existing.length, after: resolved };
    results.push(result);

    if (APPLY) {
      try {
        const jsonPublicId = `${orderFolderPath(record.orderId)}/order`;
        // Re-fetch immediately before writing rather than reusing the
        // earlier-fetched `record` — this script can take a while to run
        // across every order, and re-fetching right before the write keeps
        // the window where a concurrent change could get clobbered as small
        // as possible (these are historical orders, so that window is
        // already low-risk, but there's no reason to widen it further).
        const fresh = JSON.parse(await fetchRawText(jsonPublicId));
        fresh.assets = { ...fresh.assets, printReadyUrls: resolved };
        await uploadRaw(JSON.stringify(fresh, null, 2), jsonPublicId);
      } catch (err) {
        result.error = err.message;
      }
    }
  }

  console.log('--- Report ---\n');
  for (const r of results) {
    if (r.action === 'skip') {
      console.log(`${r.orderId}: skip (${r.reason})`);
    } else {
      console.log(
        `${r.orderId}: ${APPLY ? (r.error ? 'FAILED' : 'BACKFILLED') : 'would backfill'} — `
        + `${r.before} -> ${r.after.length} printReadyUrls: ${JSON.stringify(r.after.map((u) => u.label))}`
        + (r.error ? `  ERROR: ${r.error}` : ''),
      );
    }
  }

  const toChange = results.filter((r) => r.action === 'backfill');
  const failed = toChange.filter((r) => r.error);
  console.log(`\n${toChange.length} order(s) ${APPLY ? 'backfilled' : 'would be backfilled'}`
    + (APPLY ? ` (${failed.length} failed)` : '')
    + `, ${results.length - toChange.length} already fine / no file found.`);
  if (!APPLY && toChange.length > 0) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply to write these values for real.');
  }
  process.exit(APPLY && failed.length > 0 ? 1 : 0);
})();
