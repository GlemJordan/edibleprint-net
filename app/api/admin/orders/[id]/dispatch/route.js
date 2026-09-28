import { NextResponse } from 'next/server';
import { updateDispatchInfo } from '../../../../../../lib/order-record.js';
import { validateDispatchInput } from '../../../../../../lib/dispatch-info.js';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';

// Records the real ship date and tracking number of an order. Same ep_admin
// session auth and read-modify-write as the committed-date and status routes.
// Body: { shippedAt?: 'YYYY-MM-DD' | null, trackingNumber?: string | null };
// only the keys sent change, and null/'' clears one.
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

  const checked = validateDispatchInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  try {
    const updated = await updateDispatchInfo(orderId, checked.changes);
    return NextResponse.json({
      ok: true,
      orderId,
      shippedAt: updated.shippedAt || null,
      trackingNumber: updated.trackingNumber || null,
    });
  } catch (err) {
    if (err.status === 400) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('updateDispatchInfo failed for', orderId, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
