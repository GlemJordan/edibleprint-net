/**
 * Single source of truth for shipping pricing. Used by both the client cart
 * (app/page.js) and the server checkout route (app/api/create-checkout)
 * so the displayed total and the amount charged to Stripe never diverge.
 */

export const FLAT_SHIPPING_RATE = 9.99; // CAD, flat rate across all of Canada via Canada Post

/**
 * @param {'pickup' | 'shipping'} method
 * @returns {number} shipping cost in CAD
 */
export function getShippingCost(method) {
  if (method === 'pickup') return 0;
  // Only one paid shipping method today (flat rate). A future tracked/express
  // option can be added as another branch here without touching call sites.
  return FLAT_SHIPPING_RATE;
}
