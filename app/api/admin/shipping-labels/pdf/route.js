import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../lib/admin-auth.js';
import { loadLabelOrders, ORDER_ID_RE } from '../../../../../lib/shipping-labels-data.js';
import { expandLabels, normalizeFreeSpaces, MAX_ORDERS_PER_PDF } from '../../../../../lib/shipping-labels.js';
import { generateShippingLabelsPdf } from '../../../../../lib/shipping-labels-pdf.js';
import { formatPurchaseDateDDMMYY } from '../../../../../lib/pdf-filename.js';
import { getLogoBytes } from '../../../../../lib/generate-pdf.js';

// GET /api/admin/shipping-labels/pdf?ids=EP-AAAA,EP-BBBB&free=4
//   ids   the orders to print, in print order, at most MAX_ORDERS_PER_PDF
//         (default: the soonest MAX_ORDERS_PER_PDF still to be mailed). Each
//         is re-read and re-checked here, so one marked shipped since the
//         page loaded is left out instead of printed again.
//   free  free spaces on the sheet already in the printer: 4 (new sheet), 3 or 2.
// One label per package. Downloads as "ddmmyy-shipping-labels.pdf", the same
// date-first naming the other admin PDFs use.
export async function GET(request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const rawIds = params.get('ids');
  let ids;
  if (rawIds !== null) {
    ids = [...new Set(rawIds.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (ids.length === 0 || !ids.every((id) => ORDER_ID_RE.test(id))) {
      return NextResponse.json({ error: 'ids must be a comma-separated list of order ids' }, { status: 400 });
    }
    if (ids.length > MAX_ORDERS_PER_PDF) {
      return NextResponse.json({ error: `At most ${MAX_ORDERS_PER_PDF} orders per PDF — download them in batches` }, { status: 400 });
    }
  }
  const firstSheetFree = normalizeFreeSpaces(params.get('free'));

  try {
    const { orders } = await loadLabelOrders(ids);
    const labels = expandLabels(orders.slice(0, MAX_ORDERS_PER_PDF));
    if (labels.length === 0) {
      return NextResponse.json({ error: 'None of these orders needs a shipping label any more' }, { status: 404 });
    }
    // Same emblem file the production slip uses; null (no logo) if it can't be fetched.
    const bytes = await generateShippingLabelsPdf(labels, { firstSheetFree, logoPng: await getLogoBytes() });
    const filename = `${formatPurchaseDateDDMMYY(Date.now())}-shipping-labels.pdf`;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[admin/shipping-labels/pdf] failed:', err);
    return NextResponse.json({ error: 'Failed to generate shipping labels' }, { status: 500 });
  }
}
