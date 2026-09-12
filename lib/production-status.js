// Single source of truth for production status — previously duplicated
// verbatim (with no shared import) in app/admin/orders/[id]/page.js and
// app/api/admin/orders/[id]/status/route.js, which meant adding a status
// meant remembering to touch both. Every consumer of the status list or of
// "is this order done" reads this file instead.

export const VALID_STATUSES = [
  'paid', 'file_received', 'ready_to_print', 'printed', 'packed',
  'shipped', 'pickup_ready', 'picked_up',
];

// A production status that means "this order is fully handled" — nothing
// further needs to happen, so it should never generate a delivery-date
// alert even if its committedDate has passed. 'pickup_ready' is
// deliberately NOT here: it means "ready for the customer to come get it",
// not "they already did" — that's what 'picked_up' is for.
export const FINAL_STATUSES = ['shipped', 'picked_up'];

export function isFinalStatus(status) {
  return FINAL_STATUSES.includes(status);
}

// True when an order needs no further attention at all — either its
// production status is final, or it was refunded (nothing left to
// fulfill). Every delivery-date-alert consumer (admin list badge, daily
// digest) reads this instead of checking production.status directly, so
// the two can't independently forget the refunded case.
export function isOrderResolved(record) {
  return isFinalStatus(record?.production?.status) || record?.payment?.status === 'refunded';
}
