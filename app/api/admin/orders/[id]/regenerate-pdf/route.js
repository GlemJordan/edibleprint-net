import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';
import { fetchRawText, orderFolderPath } from '../../../../../../lib/cloudinary-ops.js';
import { generateOrderPdfs } from '../../../../../../lib/order-pdf-pipeline.js';

// Re-runs the same production-slip + print-ready PDF generation the webhook
// does at order time, against the order's already-saved order.json — the
// admin-facing fix for the "PDF missing" indicator on the order list.
export async function POST(request, { params }) {
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
    const { pdfUrl, printPdfUrls, missingAssets } = await generateOrderPdfs(record);
    return NextResponse.json({
      ok: true,
      productionSlipUrl: pdfUrl,
      printReadyCount: printPdfUrls.length,
      missingAssets,
    });
  } catch (err) {
    if (String(err.message).includes('404')) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    console.error('[admin regenerate-pdf] failed for', orderId, err);
    return NextResponse.json({ error: err.message || 'Failed to regenerate PDFs' }, { status: 500 });
  }
}
