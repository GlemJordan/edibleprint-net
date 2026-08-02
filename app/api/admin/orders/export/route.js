import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../lib/admin-auth.js';
import { fetchAllOrderRecords, buildBackupCsv, buildBackupJson } from '../../../../../lib/order-backup.js';

// On-demand companion to the daily backup cron (see app/api/cron/orders-backup)
// — same underlying data, triggered whenever the admin wants a copy (e.g.
// right before a risky change) instead of waiting for the next scheduled
// run. Full order.json bodies, not the light `context` metadata GET
// /api/admin/orders uses — this has to be restorable on its own.
export async function GET(request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const today = new Date().toISOString().slice(0, 10);

  try {
    const records = await fetchAllOrderRecords();
    if (format === 'csv') {
      return new NextResponse(buildBackupCsv(records), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="edibleprint-orders-${today}.csv"`,
        },
      });
    }
    return new NextResponse(buildBackupJson(records), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="edibleprint-orders-${today}.json"`,
      },
    });
  } catch (err) {
    console.error('[admin/orders/export] failed:', err);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}
