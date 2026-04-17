import { NextResponse } from 'next/server';
import { updateOrderStatus } from '../../../../../../lib/order-record.js';

const VALID_STATUSES = ['paid', 'file_received', 'ready_to_print', 'printed', 'packed', 'shipped', 'pickup_ready'];

export async function POST(request, { params }) {
  // Bearer token auth
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== process.env.ADMIN_API_TOKEN) {
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

  const { status, adminNote } = body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: ' + VALID_STATUSES.join(', ') },
      { status: 400 },
    );
  }

  try {
    const updated = await updateOrderStatus(orderId, status, adminNote);
    return NextResponse.json({
      ok: true,
      orderId,
      status: updated.production.status,
      updatedAt: updated.production.updatedAt,
    });
  } catch (err) {
    console.error('updateOrderStatus failed for', orderId, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
