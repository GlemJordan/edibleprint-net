import { NextResponse } from 'next/server';
import { sendOrderBackupEmail, sendBackupFailedAlert } from '../../../../lib/order-backup.js';
import { isAuthorizedCronRequest } from '../../../../lib/cron-auth.js';

export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
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
