import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../lib/admin-auth.js';
import { loadLabelOrders } from '../../../../lib/shipping-labels-data.js';
import { returnAddressLines, LABEL_NOTE } from '../../../../lib/shipping-labels.js';

// The orders still to be mailed, with each address exactly as its label will
// print it and anything wrong with it — what /admin/orders/labels shows the
// owner to review before downloading the PDF (./pdf).
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { orders, scannedAll } = await loadLabelOrders();
    return NextResponse.json({ orders, scannedAll, returnAddress: returnAddressLines(), note: LABEL_NOTE });
  } catch (err) {
    console.error('[admin/shipping-labels] list failed:', err);
    return NextResponse.json({ error: 'Failed to load orders to ship' }, { status: 500 });
  }
}
