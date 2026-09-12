// One-time migration: resyncs every order's Cloudinary search-context
// metadata (customerName/status/isPickup/committedDate/paymentStatus/etc —
// see deriveSearchContext() in lib/order-record.js) from its full order.json
// body.
//
// Root cause this fixes: deriveSearchContext() only ever ran once, at order
// creation. Every later write (updateOrderStatus, updateCommittedDate) only
// patched its own single field into context — so when isPickup/committedDate/
// paymentStatus were added to deriveSearchContext() after those functions
// already existed, no code path ever backfilled them onto an order created
// before that point. Symptom: the admin order list's Delivery column showed
// "Ship by" for pickup orders (isPickup defaulting to false when absent from
// context), regardless of the order's actual shipping method. Both write
// functions now resync the full context on every call, so this can't
// recur for a future context field — this script is the one-time catch-up
// for orders that predate that fix and haven't been touched since.
//
// Always safe to re-run: it fully recomputes context from the current
// order.json body every time, so a second run just re-confirms the same
// values (or picks up anything genuinely changed since).
//
// Usage:
//   node --env-file=.env.local scripts/backfill-search-context.mjs            (dry run — reports only, no writes)
//   node --env-file=.env.local scripts/backfill-search-context.mjs --apply    (writes for real)

import { orderFolderPath, updateResourceContext } from '../lib/cloudinary-ops.js';
import { fetchAllOrderRecords } from '../lib/order-backup.js';
import { deriveSearchContext } from '../lib/order-record.js';

const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(APPLY ? '=== APPLY MODE — writing Cloudinary context for real ===\n' : '=== DRY RUN — no writes will be made ===\n');

  const records = await fetchAllOrderRecords();
  console.log(`Scanned ${records.length} order(s).\n`);

  const results = [];
  for (const record of records) {
    const context = deriveSearchContext(record);
    const result = { orderId: record.orderId, isPickup: context.isPickup, committedDate: context.committedDate || '(none)', paymentStatus: context.paymentStatus };
    results.push(result);

    if (APPLY) {
      try {
        const jsonPublicId = `${orderFolderPath(record.orderId)}/order`;
        await updateResourceContext(jsonPublicId, context);
      } catch (err) {
        result.error = err.message;
      }
    }
  }

  console.log('--- Report ---\n');
  for (const r of results) {
    console.log(
      `${r.orderId}: isPickup=${r.isPickup} paymentStatus=${r.paymentStatus} committedDate=${r.committedDate}`
      + (r.error ? `  ERROR: ${r.error}` : ''),
    );
  }

  const failed = results.filter((r) => r.error);
  console.log(`\n${results.length} order(s) ${APPLY ? 'resynced' : 'would be resynced'}`
    + (APPLY ? ` (${failed.length} failed)` : '') + '.');
  if (!APPLY) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply to write these values for real.');
  }
  process.exit(APPLY && failed.length > 0 ? 1 : 0);
})();
