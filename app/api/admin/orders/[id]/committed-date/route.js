import { NextResponse } from 'next/server';
import { updateCommittedDate } from '../../../../../../lib/order-record.js';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same ep_admin session-cookie auth and read-modify-write pattern as
// app/api/admin/orders/[id]/status/route.js — see updateCommittedDate()
// (lib/order-record.js) for why. Used by both the order detail page and
// the order list page's inline date input, so a customer's pickup/ship-by
// date can be logged without opening each order individually.
export async function POST(request, { params }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // null/'' clears the date — a valid, intentional action (e.g. a pickup
  // date that turned out to be wrong and isn't rescheduled yet), not an
  // error, so it's accepted here rather than rejected as missing input.
  const { committedDate } = body;
  if (committedDate != null && committedDate !== '' && !DATE_RE.test(committedDate)) {
    return NextResponse.json({ error: 'committedDate must be YYYY-MM-DD or null' }, { status: 400 });
  }

  try {
    const updated = await updateCommittedDate(orderId, committedDate || null);
    return NextResponse.json({ ok: true, orderId, committedDate: updated.committedDate || null });
  } catch (err) {
    console.error('updateCommittedDate failed for', orderId, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
