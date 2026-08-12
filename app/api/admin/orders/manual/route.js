import { NextResponse } from 'next/server';
import { getAdminSession } from '../../../../../lib/admin-auth.js';
import { buildManualOrderRecord, generateManualOrderId, saveOrderRecord } from '../../../../../lib/order-record.js';
import { generateOrderPdfs } from '../../../../../lib/order-pdf-pipeline.js';
import { isValidEmail } from '../../../../../lib/validate-email.js';

const CHANNELS = ['marketplace', 'instagram', 'referral', 'walk_in', 'other'];
const PAYMENT_METHODS = ['cash', 'e_transfer', 'other'];

// Records a sale that happened outside Stripe (cash, e-transfer, marketplace,
// etc.) — the ONLY record of it anywhere, since there's no Stripe session to
// fall back on. Deliberately does NOT recompute/validate pricing the way
// create-checkout does for catalog-prices.js: that enforcement exists
// because a checkout price travels through an untrusted browser; this route
// is admin-session-gated, so the amount typed into the form is trusted as
// entered. Also deliberately sends no email (owner or customer) — the admin
// is entering this live and already knows it happened; a future "send
// customer email" action, if wanted, is a separate explicit trigger, not
// automatic here.
export async function POST(request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    customerName, customerEmail, customerPhone,
    channel, paymentMethod,
    shape, material, size, quantity,
    amountCents,
    isPickup, shippingAddress,
    saleDate, notes,
    imageUrl,
  } = body;

  if (!customerName) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  }
  if (customerEmail && !isValidEmail(customerEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (!CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel. Must be one of: ' + CHANNELS.join(', ') }, { status: 400 });
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: 'Invalid payment method. Must be one of: ' + PAYMENT_METHODS.join(', ') }, { status: 400 });
  }
  if (!shape || !size) {
    return NextResponse.json({ error: 'Shape and size are required' }, { status: 400 });
  }
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'Amount charged is required' }, { status: 400 });
  }
  if (!isPickup && !shippingAddress?.line1) {
    return NextResponse.json({ error: 'Shipping address is required when not picking up' }, { status: 400 });
  }

  const orderId = generateManualOrderId();
  const record = buildManualOrderRecord({
    customerName, customerEmail, customerPhone,
    channel, paymentMethod,
    shape, material, size, quantity,
    amountCents,
    isPickup, shippingAddress,
    saleDate, notes,
    imageUrl,
  }, orderId);

  const savedRecord = await saveOrderRecord(record);

  // Same shared pipeline the Stripe webhook uses — only runs the print-ready
  // step for designs that actually have an imageUrl, so an order with no
  // uploaded file simply gets its production slip (still useful: it's the
  // paper trail for a cash/e-transfer sale) and no print-ready PDF.
  const { pdfUrl, printPdfUrls, missingAssets } = await generateOrderPdfs(savedRecord);

  return NextResponse.json({
    ok: true,
    orderId,
    productionSlipUrl: pdfUrl,
    printReadyCount: printPdfUrls.length,
    missingAssets,
  });
}
