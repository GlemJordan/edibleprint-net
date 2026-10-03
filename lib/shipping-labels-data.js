// Reads the orders that need shipping labels. Server-only (Cloudinary).
//
// The shipping address lives only in each order's full order.json body, not
// in the light search context the admin list reads — so this narrows the
// list down with that context first (method, status, refund) and then fetches
// the bodies of only the handful still waiting to be mailed. The final say
// is always the body (needsShippingLabel), since context can lag behind it.

import { searchOrders, fetchRawText, orderFolderPath, ORDER_PUBLIC_ID_RE } from './cloudinary-ops.js';
import { FINAL_STATUSES } from './production-status.js';
import { describeLabelOrders } from './shipping-labels.js';

const MAX_PAGES = 10; // same safety cap as GET /api/admin/orders
const CHUNK = 6;

// Order ids as generateUniqueOrderId() makes them ('EP-4T7K'), with room for
// older/longer forms; anything else in a query string is rejected outright.
export const ORDER_ID_RE = /^EP-[A-Z0-9-]{2,40}$/;

async function fetchRecord(orderId) {
  return JSON.parse(await fetchRawText(`${orderFolderPath(orderId)}/order`));
}

async function fetchRecords(orderIds) {
  const records = [];
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const batch = await Promise.all(orderIds.slice(i, i + CHUNK).map(async (id) => {
      try {
        return await fetchRecord(id);
      } catch (e) {
        console.warn('[shipping-labels] could not read', id, e.message);
        return null;
      }
    }));
    records.push(...batch.filter(Boolean));
  }
  return records;
}

/** Order ids whose search context says they might still need mailing. */
async function candidateOrderIds() {
  const ids = [];
  let cursor;
  let pages = 0;
  do {
    const result = await searchOrders({ maxResults: 100, nextCursor: cursor });
    pages++;
    for (const r of result.resources || []) {
      const match = ORDER_PUBLIC_ID_RE.exec(r.public_id || '');
      if (!match) continue;
      const c = r.context?.custom || r.context || {};
      const pickup = c.shippingMethod === 'pickup' || c.isPickup === 'true';
      if (pickup || FINAL_STATUSES.includes(c.status) || c.paymentStatus === 'refunded') continue;
      ids.push(match[1]);
    }
    cursor = result.next_cursor || null;
  } while (cursor && pages < MAX_PAGES);
  return { ids, scannedAll: !cursor };
}

/**
 * Every order still to be mailed, reviewed and ready to print — or, with
 * `orderIds`, just those (each re-checked, so an order marked shipped in the
 * meantime is left out rather than printed twice).
 *
 * @param {string[]} [orderIds]
 * @returns {Promise<{ orders: ReturnType<typeof describeLabelOrders>, scannedAll: boolean }>}
 */
export async function loadLabelOrders(orderIds) {
  if (orderIds) {
    const records = await fetchRecords(orderIds);
    // Keep the order the admin chose them in.
    const byId = new Map(describeLabelOrders(records).map((o) => [o.orderId, o]));
    return { orders: orderIds.map((id) => byId.get(id)).filter(Boolean), scannedAll: true };
  }
  const { ids, scannedAll } = await candidateOrderIds();
  return { orders: describeLabelOrders(await fetchRecords(ids)), scannedAll };
}
