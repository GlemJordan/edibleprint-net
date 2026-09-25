// What the admin records once an order is dispatched: the real ship date and
// the tracking number. Pure (no I/O) so the rules can be checked without an
// admin session; the route calls this, then updateDispatchInfo() saves it.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Canada Post tracking numbers are letters and digits (12–16 digits, or a
// 2-letter/9-digit/"CA" form). Spaces and dashes are allowed so a number can be
// pasted as printed on the receipt.
const TRACKING_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;

/**
 * @param {unknown} body  parsed JSON body of the dispatch request
 * @returns {{ ok: true, changes: { shippedAt?: string | null, trackingNumber?: string | null } }
 *         | { ok: false, error: string }}
 *
 * Only the keys present are changed. An empty string or null clears that
 * field (a wrong entry is fixed by clearing it, not an error). shippedAt must
 * be a real calendar date, YYYY-MM-DD.
 */
export function validateDispatchInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request body' };
  const changes = {};

  if ('shippedAt' in body) {
    const v = body.shippedAt;
    if (v === null || v === '') {
      changes.shippedAt = null;
    } else {
      const m = typeof v === 'string' ? DATE_RE.exec(v) : null;
      const real = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!real || real.toISOString().slice(0, 10) !== v) {
        return { ok: false, error: 'shippedAt must be a real date, YYYY-MM-DD' };
      }
      changes.shippedAt = v;
    }
  }

  if ('trackingNumber' in body) {
    const v = body.trackingNumber;
    if (v === null || v === '') {
      changes.trackingNumber = null;
    } else {
      const t = typeof v === 'string' ? v.trim() : null;
      if (t === null || !TRACKING_RE.test(t)) {
        return { ok: false, error: 'trackingNumber can only use letters, digits, spaces and dashes (up to 40 characters)' };
      }
      changes.trackingNumber = t;
    }
  }

  if (Object.keys(changes).length === 0) return { ok: false, error: 'Nothing to update: send shippedAt and/or trackingNumber' };
  return { ok: true, changes };
}
