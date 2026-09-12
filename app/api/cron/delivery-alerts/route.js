import { NextResponse } from 'next/server';
import { sendDeliveryAlertsEmail, sendDeliveryAlertsFailedAlert } from '../../../../lib/delivery-alerts.js';
import { isAuthorizedCronRequest } from '../../../../lib/cron-auth.js';

// Daily companion to app/api/cron/orders-backup (weekly) — see vercel.json
// for the schedule. Same CRON_SECRET-gated auth, same "send nothing on a
// quiet day" philosophy, but re-evaluated fresh every run rather than
// gated on "changed since last time": an order that's still overdue
// tomorrow should be mentioned again, not just once.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendDeliveryAlertsEmail();
    if (result.skipped) {
      console.log('[cron/delivery-alerts] skipped — nothing overdue, due today, or due tomorrow');
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/delivery-alerts] failed:', err);
    try {
      await sendDeliveryAlertsFailedAlert(err);
    } catch (alertErr) {
      console.error('[cron/delivery-alerts] failure alert itself also failed:', alertErr.message);
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
