import { timingSafeEqual } from 'crypto';

// Shared by every Vercel Cron route (app/api/cron/orders-backup,
// app/api/cron/delivery-alerts) — extracted from orders-backup's original
// inline copy so a second cron route didn't have to duplicate the same
// constant-time comparison logic.
//
// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on its own
// scheduled invocations when a CRON_SECRET env var is set (see vercel.json).
// Every rejection path returns the exact same generic response from the
// caller — a request can't tell "wrong secret" apart from "no secret" apart
// from "secret not configured on the server" apart from any other failure,
// by design.
export function isAuthorizedCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, and requires equal-length buffers — the length check below both
  // avoids that throw and is itself constant-time-irrelevant (it leaks only
  // "your token's length was wrong", not any information about its content).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
