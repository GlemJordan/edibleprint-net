import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../lib/admin-auth.js';
import { searchOrders } from '../../../../lib/cloudinary-ops.js';

// Only a public_id shaped EXACTLY like "edibleprint/orders/{orderId}/order"
// is a real order record. Cloudinary's Search expression is a fuzzy/coarse
// pre-filter (see lib/cloudinary-ops.js) that also returns unrelated
// resources — e.g. customer photo uploads from the editor flow's
// "edibleprint-orders/" folder, and each order's own production-slip.pdf/
// notes/print-design*.pdf siblings — so this regex is the actual source of
// truth for "is this an order", not the search expression.
const ORDER_PUBLIC_ID_RE = /^edibleprint\/orders\/([^/]+)\/order$/;

const MAX_PAGES = 10; // safety cap: up to 1000 raw search results scanned per request

// One or more Cloudinary Search API calls (paginated), reading the light
// `context` metadata attached to each order.json at save/update time —
// never fetches the full order.json body for every order. See
// lib/order-record.js (saveOrderRecord, updateOrderStatus) for where that
// context is written/kept in sync.
export async function GET(request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orders = [];
    let cursor = new URL(request.url).searchParams.get('cursor') || undefined;
    let pagesFetched = 0;
    let lastResult = null;

    // Follow Cloudinary's pagination until we've scanned MAX_PAGES worth of
    // raw results — noise from non-order resources means a page of 100 raw
    // hits can easily contain far fewer than 100 real orders, so a single
    // page isn't reliably "the first 100 orders".
    do {
      lastResult = await searchOrders({ maxResults: 100, nextCursor: cursor });
      pagesFetched++;
      for (const r of lastResult.resources || []) {
        const match = ORDER_PUBLIC_ID_RE.exec(r.public_id || '');
        if (!match) continue;
        const context = r.context?.custom || r.context || {};
        orders.push({
          orderId: match[1],
          customerName: context.customerName || '',
          total: context.total != null ? parseFloat(context.total) : null,
          status: context.status || 'unknown',
          hasUploadDesign: context.hasUploadDesign === 'true',
          designCount: context.designCount != null ? parseInt(context.designCount, 10) : null,
          createdAt: r.created_at,
          // Absent on orders saved before these existed — same 'stripe' /
          // 'website' / 'stripe_card' defaults deriveSearchContext() applies
          // when writing context, so a pre-existing order's row can't show
          // a blank/different value than what it actually was.
          source: context.source || 'stripe',
          channel: context.channel || 'website',
          paymentMethod: context.paymentMethod || 'stripe_card',
          // Set by lib/order-pdf-pipeline.js after PDF generation — absent
          // on orders processed before that started (context.missingAssets
          // is undefined then), which we deliberately read as "not flagged"
          // rather than "missing", since the pipeline was already working
          // for those and there's no evidence otherwise.
          missingAssets: context.missingAssets === 'true',
        });
      }
      cursor = lastResult.next_cursor || null;
    } while (cursor && pagesFetched < MAX_PAGES);

    return NextResponse.json({
      orders,
      nextCursor: cursor || null,
      scannedAllResults: !cursor,
    });
  } catch (err) {
    console.error('[admin/orders] list failed:', err);
    return NextResponse.json({ error: 'Failed to list orders' }, { status: 500 });
  }
}
