import { describeDispatch, resolveOrderDispatch } from './shipping-config.js';

// Orders in these states are out of the door: nothing left to plan for.
const DONE_STATUSES = new Set(['shipped', 'picked_up']);
const CHUNK = 6;

/**
 * Fills in how the rows of the admin order list ship, in place.
 *
 * Rows come from Cloudinary search context, which only newer orders carry
 * shipping method and packages in. For an older order that is still waiting to
 * go out, the sheets are in its order body, so `fetchRecord` reads just those
 * (a handful, and only until they ship) instead of showing a blank or guessing.
 * Shipped/picked-up orders are history and keep no count; pickup orders have
 * nothing to count. A failed read leaves that one row without a count and never
 * fails the list.
 *
 * @param {Array<{ orderId: string, status: string, packages: number | null, shippingMethod: string }>} orders
 * @param {(orderId: string) => Promise<object>} fetchRecord  returns the order.json record
 * @returns {Promise<void>}
 */
export async function fillLegacyDispatch(orders, fetchRecord) {
  const pending = orders.filter((o) => o.packages === null && !DONE_STATUSES.has(o.status) && o.shippingMethod !== 'pickup');
  for (let i = 0; i < pending.length; i += CHUNK) {
    await Promise.all(pending.slice(i, i + CHUNK).map(async (o) => {
      try {
        const dispatch = resolveOrderDispatch(await fetchRecord(o.orderId));
        o.shippingMethod = dispatch.method;
        o.packages = dispatch.packages;
      } catch (e) {
        console.warn('[admin/orders] could not read packages for', o.orderId, e.message);
      }
    }));
  }
  for (const o of orders) o.dispatchLine = describeDispatch(o.shippingMethod, o.packages).line;
}
