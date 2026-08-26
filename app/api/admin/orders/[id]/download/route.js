import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';
import { fetchRawText, orderFolderPath } from '../../../../../../lib/cloudinary-ops.js';
import { resolvePrintReadyUrls } from '../../../../../../lib/order-record.js';
import { buildPdfFilename } from '../../../../../../lib/pdf-filename.js';

// Proxies an order's production slip / print-ready PDF through our own
// origin so the browser gets our ddmmyy-CustomerName filename instead of
// the Cloudinary asset's internal public_id (e.g. "print-design.pdf") — the
// `download` attribute on a plain <a href> is ignored cross-origin, so the
// admin page can't do this with a link alone. Same ep_admin session auth as
// every other admin/orders/:id route.
export async function GET(request, { params }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'slip' | 'print'
  const index = parseInt(searchParams.get('index'), 10) || 0;

  let record;
  try {
    const text = await fetchRawText(`${orderFolderPath(orderId)}/order`);
    record = JSON.parse(text);
  } catch (err) {
    if (String(err.message).includes('404')) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    console.error('[admin download] order fetch failed:', err);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }

  let assetUrl;
  let labelSuffix = '';
  if (type === 'slip') {
    assetUrl = record.assets?.productionSlipUrl;
  } else if (type === 'print') {
    const printReadyUrls = await resolvePrintReadyUrls(record);
    assetUrl = printReadyUrls[index]?.url;
    if (printReadyUrls.length > 1) labelSuffix = `-${index + 1}`;
  }

  if (!assetUrl) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const assetResp = await fetch(assetUrl);
  if (!assetResp.ok) {
    return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 502 });
  }
  const bytes = await assetResp.arrayBuffer();

  const baseFilename = buildPdfFilename({
    purchaseDate: record.saleDate || record.createdAt,
    customerName: record.customer?.name,
    fallbackId: record.orderNumber || record.orderId,
  });
  const filename = labelSuffix
    ? baseFilename.replace(/\.pdf$/i, `${labelSuffix}.pdf`)
    : baseFilename;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': assetResp.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
