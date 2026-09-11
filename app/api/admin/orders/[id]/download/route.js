import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../../lib/admin-auth.js';
import { fetchRawText, orderFolderPath } from '../../../../../../lib/cloudinary-ops.js';
import { resolvePrintReadyUrls } from '../../../../../../lib/order-record.js';
import { buildPdfFilename } from '../../../../../../lib/pdf-filename.js';
import { generatePrintPdf, parseDesignSizeForPdf } from '../../../../../../lib/generate-pdf.js';
import { resolveMaterial } from '../../../../../../lib/material-config.js';
import { shapeSupportsCutGuide } from '../../../../../../lib/cut-guide-config.js';

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
  // 'with guide' / 'without guide' override (see the admin order page) —
  // absent for the normal single download link, which just serves whatever
  // was already generated at checkout/regenerate time for this design's own
  // cutGuide choice.
  const guideParam = searchParams.get('guide'); // '1' | '0' | null

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

  let bytes;
  let contentType = 'application/pdf';
  let labelSuffix = '';

  if (type === 'slip') {
    const assetUrl = record.assets?.productionSlipUrl;
    if (!assetUrl) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    const assetResp = await fetch(assetUrl);
    if (!assetResp.ok) return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 502 });
    bytes = await assetResp.arrayBuffer();
    contentType = assetResp.headers.get('content-type') || contentType;
  } else if (type === 'print') {
    const designs = record.designs || [];
    if (designs.length > 1) labelSuffix = `-${index + 1}`;
    const design = designs[index];
    // The base asset is always clean (the cut guide is never baked into it —
    // see lib/generate-pdf.js), so an explicit guide=0/1 regenerates the PDF
    // fresh with that forced value instead of serving whatever was already
    // generated for this design's own cutGuide choice. Never offered for a
    // customer-supplied upload (print-as-is, no guide concept) or a shape/
    // sub-shape that doesn't support one — the admin page only renders the
    // two buttons when this would succeed.
    if (guideParam != null && design?.imageUrl && design.sourceType !== 'upload' && shapeSupportsCutGuide(design.shape, design.customShapeKind)) {
      const { sizeInches, customW, customH } = parseDesignSizeForPdf(design);
      bytes = await generatePrintPdf({
        imageUrl: design.imageUrl, shape: design.shape, material: resolveMaterial(design),
        sizeInches, customW, customH,
        cutGuide: guideParam === '1', customShapeKind: design.customShapeKind,
      });
      labelSuffix += guideParam === '1' ? '-with-guide' : '-no-guide';
    } else {
      const printReadyUrls = await resolvePrintReadyUrls(record);
      const assetUrl = printReadyUrls[index]?.url;
      if (!assetUrl) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      const assetResp = await fetch(assetUrl);
      if (!assetResp.ok) return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 502 });
      bytes = await assetResp.arrayBuffer();
      contentType = assetResp.headers.get('content-type') || contentType;
    }
  }

  if (!bytes) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

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
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
