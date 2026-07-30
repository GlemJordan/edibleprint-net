import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../lib/admin-auth.js';
import { fetchRawText, orderFolderPath } from '../../../../../lib/cloudinary-ops.js';

// Full order.json for one order — customer PII, shipping address, and (for
// upload-flow designs) sourceType/selectedPage/pageCount/approvedAt. Same
// ep_admin session auth as GET /api/admin/orders and the status endpoint;
// no route that returns customer data may skip this check.
export async function GET(request, { params }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
  }

  try {
    const text = await fetchRawText(`${orderFolderPath(orderId)}/order`);
    const record = JSON.parse(text);
    return NextResponse.json(record);
  } catch (err) {
    if (String(err.message).includes('404')) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    console.error('[admin/orders/:id] fetch failed:', err);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}
