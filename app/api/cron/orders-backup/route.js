import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { sendOrderBackupEmail, sendBackupFailedAlert } from '../../../../lib/order-backup.js';

// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on its own
// scheduled invocations when a CRON_SECRET env var is set (see vercel.json).
// Every rejection path below returns the exact same generic response — a
// caller can't tell "wrong secret" apart from "no secret" apart from "secret
// not configured on the server" apart from any other failure, by design.
function isAuthorized(request) {
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

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendOrderBackupEmail();
    if (result.skipped) {
      console.log('[cron/orders-backup] skipped — no new or changed orders since last backup');
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/orders-backup] failed:', err);
    try {
      await sendBackupFailedAlert(err);
    } catch (alertErr) {
      console.error('[cron/orders-backup] failure alert itself also failed:', alertErr.message);
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
