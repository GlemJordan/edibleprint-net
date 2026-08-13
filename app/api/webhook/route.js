import Stripe from 'stripe';
import { NextResponse, after } from 'next/server';
import { buildOrderRecord, saveOrderRecord, recordNotification, urgentFlagLabel } from '../../../lib/order-record.js';
import { generateOrderPdfs } from '../../../lib/order-pdf-pipeline.js';
import { withRetry } from '../../../lib/with-retry.js';
import { BUSINESS_ADDRESS_ONE_LINE, BUSINESS_PHONE_DISPLAY } from '../../../lib/business-info.js';

// CASL sender-identification footer for the 4 customer/admin-facing
// templates (owner order email, customer confirmation, magic link,
// generate-pdf's customer email) — NOT added to sendAlertEmail/
// sendCriticalOrderLossAlert below, since those are internal operational
// alerts to the business owner, not commercial electronic messages to a
// third party.
const CASL_FOOTER_HTML = '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:8px 0 0;line-height:1.6;">EdiblePrint.net — ' + BUSINESS_ADDRESS_ONE_LINE + '</p>';
const CASL_FOOTER_TEXT = '\nEdiblePrint.net — ' + BUSINESS_ADDRESS_ONE_LINE + '\n';

export const maxDuration = 60;

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? process.env.STRIPE_SECRET_KEY_TEST
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);
const webhookSecret = isTest
  ? process.env.STRIPE_WEBHOOK_SECRET_TEST
  : process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(stripeKey);

// Absolute URL required — email clients don't resolve relative paths.
// logo-full.png (white/light circular badge) is used here rather than the
// dark-green wordmark variants, since it needs to read on the dark green
// banner background both emails use.
const LOGO_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net') + '/logo-assets/logo-full.png';

const SHAPE_LABELS = {
  circular: 'Round', square: 'Square', rectangular: 'Rectangle',
  fullsheet: 'Full Sheet', multicircle: 'Cookie Sheet', heart: 'Heart', custom: 'Custom',
  bwsheet: 'B&W Sheet (GRAYSCALE)',
  waferletter: 'Wafer Paper — Letter Sheet',
};

function parseDesigns(meta) {
  const designCount = parseInt(meta.designCount || '1', 10);
  const designs = [];
  for (let i = 0; i < designCount; i++) {
    if (meta['d' + i + '_shape']) {
      const design = {
        shape:    meta['d' + i + '_shape'],
        size:     meta['d' + i + '_size']     || '',
        qty:      meta['d' + i + '_qty']      || '1',
        price:    meta['d' + i + '_price']    || '0',
        notes:    meta['d' + i + '_notes']    || 'None',
        imageUrl: meta['d' + i + '_imageUrl'] || 'No image',
      };
      // d{i}_uploadMeta's mere presence marks this as an "I already have my
      // design" order — see app/api/create-checkout/route.js for why there's
      // no separate d{i}_sourceType key.
      const uploadMetaRaw = meta['d' + i + '_uploadMeta'];
      if (uploadMetaRaw) {
        const parts = Object.fromEntries(
          uploadMetaRaw.split(';').filter(Boolean).map((kv) => kv.split('='))
        );
        design.sourceType   = 'upload';
        design.selectedPage = parseInt(parts.page, 10) || 1;
        design.pageCount    = parseInt(parts.pages, 10) || 1;
        design.approvedAt   = parts.approvedAt || '';
      }
      // d{i}_catalogId's mere presence marks this as a ready-made catalog
      // design order (app/designs/[id]/page.js) — same marker convention as
      // d{i}_uploadMeta above; a design is never both.
      const catalogId = meta['d' + i + '_catalogId'];
      if (catalogId) {
        design.catalogDesignId = catalogId;
        design.customText      = meta['d' + i + '_customText'] || '';
      }
      designs.push(design);
    } else {
      designs.push({
        shape:    meta.shape     || 'circular',
        size:     meta.size      || '',
        qty:      meta.quantity  || '1',
        price:    meta.unitPrice || '0',
        notes:    meta.notes     || 'None',
        imageUrl: meta.imageUrl  || 'No image',
      });
    }
  }
  return designs;
}

async function sendAlertEmail(orderId, errorMsg) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: ['edibleprintorders@gmail.com'],
        subject: '⚠️ ORDER PROCESSING FAILED — #' + orderId,
        html: '<p><strong>Order ' + orderId + ' failed to process fully.</strong></p>'
          + '<p>Error: ' + String(errorMsg).slice(0, 500) + '</p>'
          + '<p>Check Vercel logs and Stripe dashboard. Customer payment was captured successfully.</p>',
        text: 'Order ' + orderId + ' failed to process fully.\n\n'
          + 'Error: ' + String(errorMsg).slice(0, 500) + '\n\n'
          + 'Check Vercel logs and Stripe dashboard. Customer payment was captured successfully.',
      }),
    });
  } catch (e) {
    console.error('Alert email failed:', e.message);
  }
}

// Item 1 of the deliverability hardening pass: the customer confirmation
// email previously failed silently (console.error only, nobody notified).
// This mirrors sendAlertEmail's shape but is specific enough to act on
// immediately — it names the customer's email and the exact error, since
// the fix is usually "manually resend/contact the customer," not "check logs."
async function sendCustomerEmailFailedAlert(orderId, customerEmail, err) {
  const errorMsg = String(err?.message || err).slice(0, 500);
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com', 'edibleprintorders@gmail.com'],
        subject: '⚠️ Customer confirmation email FAILED — #' + orderId,
        html: '<p><strong>The order confirmation email to the customer for order ' + orderId + ' failed to send after retries.</strong></p>'
          + '<p>The order itself was processed successfully — this only affects the customer\'s confirmation email.</p>'
          + '<p><strong>Customer email:</strong> ' + (customerEmail || 'unknown') + '</p>'
          + '<p><strong>Error:</strong> ' + errorMsg + '</p>'
          + '<p>Consider contacting the customer directly to confirm their order, since they may not know it went through.</p>',
        text: 'The order confirmation email to the customer for order ' + orderId + ' failed to send after retries.\n\n'
          + 'The order itself was processed successfully — this only affects the customer\'s confirmation email.\n\n'
          + 'Customer email: ' + (customerEmail || 'unknown') + '\n'
          + 'Error: ' + errorMsg + '\n\n'
          + 'Consider contacting the customer directly to confirm their order, since they may not know it went through.',
      }),
    });
  } catch (e) {
    console.error('Customer-email-failed alert itself failed to send:', e.message);
  }
}

// The worst-case failure: payment was captured but order.json never got
// created — the order literally does not exist anywhere except this email
// and the raw Stripe session. Unlike sendAlertEmail() above (used for every
// other failure, where order.json already exists and the admin UI/Cloudinary
// folder can be opened to see what's there), this has to carry everything
// needed to reconstruct the order by hand: nothing else to fall back on.
// design.imageUrl here still works — the client uploads images to Cloudinary
// as part of checkout submission, before this webhook ever runs, so those
// files exist independently of whether order.json saved.
async function sendCriticalOrderLossAlert(session, orderId, designs, err, isTest) {
  const meta = session.metadata || {};
  const totalAmt = (session.amount_total || 0) / 100;
  const customerName = meta.customerName || session.customer_details?.name || 'unknown';
  const customerEmail = session.customer_email || session.customer_details?.email || 'unknown';

  const designRows = designs.map((d, i) => {
    const shapeLabel = SHAPE_LABELS[d.shape] || d.shape || 'unknown shape';
    return '<tr' + (i % 2 === 0 ? ' style="background:#f9fafb;"' : '') + '>'
      + '<td style="padding:8px 14px;">' + (i + 1) + '</td>'
      + '<td style="padding:8px 14px;">' + shapeLabel + (d.sourceType === 'upload' ? ' (customer-supplied file)' : '') + '</td>'
      + '<td style="padding:8px 14px;">' + (d.size || '—') + '</td>'
      + '<td style="padding:8px 14px;">' + (d.qty || '1') + '</td>'
      + '<td style="padding:8px 14px;">$' + (parseFloat(d.price) || 0).toFixed(2) + '</td>'
      + '<td style="padding:8px 14px;">'
        + (d.imageUrl && d.imageUrl !== 'No image'
            ? '<a href="' + d.imageUrl + '">' + d.imageUrl + '</a>'
            : '<em>no image</em>')
      + '</td>'
      + '</tr>';
  }).join('');

  const html = '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">'
    + '<div style="background:#DC2626;color:white;padding:20px;font-weight:bold;font-size:18px;">'
    + '🚨 CRITICAL — payment captured, order record was never saved.'
    + '<div style="font-weight:normal;font-size:14px;margin-top:6px;">This order does not exist in Cloudinary, order.json, or the admin dashboard. Everything below is what\'s needed to rebuild it by hand.</div>'
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;">'
    + (isTest ? '<p style="background:#F59E0B;color:white;padding:8px 12px;border-radius:6px;display:inline-block;"><strong>TEST MODE</strong> — not a real payment.</p>' : '')
    + '<h3 style="color:#DC2626;margin-top:0;">Stripe references</h3>'
    + '<p>'
      + '<strong>Checkout Session ID:</strong> ' + session.id + '<br/>'
      + '<strong>Payment Intent:</strong> ' + (session.payment_intent
          ? '<a href="https://dashboard.stripe.com/' + (isTest ? 'test/' : '') + 'payments/' + session.payment_intent + '">' + session.payment_intent + '</a>'
          : '—') + '<br/>'
      + '<strong>Would-be Order ID:</strong> ' + orderId
    + '</p>'
    + '<h3 style="color:#DC2626;">Customer</h3>'
    + '<p>'
      + '<strong>Name:</strong> ' + customerName + '<br/>'
      + '<strong>Email:</strong> ' + customerEmail + '<br/>'
      + '<strong>Phone:</strong> ' + (meta.customerPhone || '—')
    + '</p>'
    + '<h3 style="color:#DC2626;">Payment</h3>'
    + '<p><strong>Total charged:</strong> $' + totalAmt.toFixed(2) + ' CAD</p>'
    + '<h3 style="color:#DC2626;">Shipping</h3>'
    + '<p>' + (meta.shippingMethod === 'pickup'
        ? 'PICKUP — East London'
        : (meta.shippingAddress || '—') + '<br/>' + (meta.shippingCity || '') + ', ' + (meta.shippingProvince || '') + ' ' + (meta.shippingPostal || ''))
      + '</p>'
    + '<h3 style="color:#DC2626;">Designs — format, material, and image URLs</h3>'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead><tr style="background:#DC2626;color:white;"><th style="padding:8px 14px;text-align:left;">#</th><th style="padding:8px 14px;text-align:left;">Format</th><th style="padding:8px 14px;text-align:left;">Size</th><th style="padding:8px 14px;text-align:left;">Qty</th><th style="padding:8px 14px;text-align:left;">Price</th><th style="padding:8px 14px;text-align:left;">Image URL</th></tr></thead>'
    + '<tbody>' + designRows + '</tbody>'
    + '</table>'
    + '<h3 style="color:#DC2626;">What actually failed</h3>'
    + '<p style="font-family:monospace;font-size:12px;background:#f3f4f6;padding:10px;border-radius:6px;white-space:pre-wrap;">' + String(err?.message || err).slice(0, 800) + '</p>'
    + '<p style="font-size:13px;color:#6b7280;">Full stack trace is in Vercel logs for this invocation. To rebuild: create the order manually from the data above, or see if a Stripe-session replay tool has been built (ask about reconstructing order.json from the Checkout Session ID).</p>'
    + '</div></div>';

  const text = 'CRITICAL — payment captured, order record was never saved.\n'
    + 'This order does not exist in Cloudinary, order.json, or the admin dashboard.\n\n'
    + (isTest ? 'TEST MODE — not a real payment.\n\n' : '')
    + 'Stripe references\n'
    + 'Checkout Session ID: ' + session.id + '\n'
    + 'Payment Intent: ' + (session.payment_intent || '—') + '\n'
    + 'Would-be Order ID: ' + orderId + '\n\n'
    + 'Customer\n'
    + 'Name: ' + customerName + '\n'
    + 'Email: ' + customerEmail + '\n'
    + 'Phone: ' + (meta.customerPhone || '—') + '\n\n'
    + 'Payment\n'
    + 'Total charged: $' + totalAmt.toFixed(2) + ' CAD\n\n'
    + 'Shipping\n'
    + (meta.shippingMethod === 'pickup'
        ? 'PICKUP — East London'
        : (meta.shippingAddress || '—') + ', ' + (meta.shippingCity || '') + ', ' + (meta.shippingProvince || '') + ' ' + (meta.shippingPostal || '')) + '\n\n'
    + 'What actually failed\n'
    + String(err?.message || err).slice(0, 800) + '\n\n'
    + 'Full stack trace is in Vercel logs for this invocation.';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EdiblePrint.net <orders@edibleprint.net>',
        to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com', 'edibleprintorders@gmail.com'],
        subject: '🚨 CRITICAL: ORDER LOST — payment captured, no record saved — ' + (session.id || orderId),
        html,
        text,
      }),
    });
  } catch (e) {
    // Last-resort log — if even this fails, Vercel's own error log for this
    // invocation (which includes the full session object via the console.error
    // in the caller) is the only remaining trail.
    console.error('CRITICAL: order-loss alert email itself failed to send:', e.message);
  }
}

async function processOrder(session, orderId) {
  const meta = session.metadata || {};

  // "Download as PDF" purchases (app/api/create-download-checkout) are
  // fully self-contained on the client: /download-pdf calls
  // /api/generate-pdf right after payment, which streams the PDF straight
  // back for an immediate browser download AND emails the customer a copy
  // with printing instructions — see that route. There is no physical
  // fulfillment for these (nothing to print, pack, or ship), so none of
  // this pipeline applies. Before this check, a pdf_download session still
  // ran the whole thing: parseDesigns() fell through to its generic-
  // fallback branch (this metadata shape has no d{i}_shape keys), producing
  // a garbled order.json (empty customer name, a fake "Canada Post
  // Shipping" method with no address, a $0 line item despite the real
  // amount charged), a production slip nobody needs, and "New Order" /
  // "order confirmation" owner+customer emails implying a shipment that
  // was never coming. See EP-LBWA9GQ3 for a real example of the fallout.
  if (meta.type === 'pdf_download') {
    console.log('[webhook]', orderId, 'is a PDF-download purchase — no physical fulfillment needed, skipping the order pipeline.');
    return;
  }

  const designs = parseDesigns(meta);
  const isPickup = meta.shippingMethod === 'pickup';

  const subtotalAmt = designs.reduce((s, d) => s + parseFloat(d.price) * parseInt(d.qty, 10), 0);
  const shippingAmt = parseFloat(meta.shippingCost) || 0;
  const totalAmt    = session.amount_total / 100;

  const shippingLabel = meta.shippingMethod === 'pickup' ? 'Pickup — East London, ON' : 'Canada Post Shipping';

  // 1. Build + save OrderRecord (order.json + notes.txt → Cloudinary).
  // Isolated in its own try/catch: if this specific step fails after
  // retries, order.json never exists anywhere, so the alert has to carry
  // everything needed to rebuild the order by hand — see
  // sendCriticalOrderLossAlert. err.alreadyAlerted stops the generic
  // catch in POST() below from also sending its much thinner alert.
  const record = buildOrderRecord(session, designs, orderId, isTest);
  let savedRecord;
  try {
    savedRecord = await withRetry(
      () => saveOrderRecord(record),
      'saveOrderRecord:' + orderId,
    );
  } catch (err) {
    await sendCriticalOrderLossAlert(session, orderId, designs, err, isTest);
    err.alreadyAlerted = true;
    throw err;
  }

  // 2-3b. Production slip + per-design print-ready PDFs — generated,
  // uploaded, and persisted onto order.json by the shared pipeline (also
  // used by the admin "Regenerate PDFs" action), so this order's PDF state
  // is computed in exactly one place regardless of which caller triggers it.
  const { pdfUrl, printPdfUrls, missingAssets } = await generateOrderPdfs(savedRecord);
  if (missingAssets) {
    console.warn('[webhook] order', orderId, 'is missing its production slip and/or a print-ready PDF — flagged in the admin order list.');
  }

  // 4. Owner email with PDF attachment
  const buildDesignRowsOwner = (d, i) => {
    const shapeLabel = SHAPE_LABELS[d.shape] || d.shape;
    const lineTotal  = (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2);
    return '<tr' + (i % 2 === 0 ? ' style="background:#f9fafb;"' : '') + '>'
      + '<td style="padding:8px 14px;font-weight:600;color:#374151;">'
      + (designs.length > 1 ? 'Design ' + (i + 1) : 'Print') + '</td>'
      + '<td style="padding:8px 14px;">' + d.qty + 'x ' + d.size + ' (' + shapeLabel + ')</td>'
      + '<td style="padding:8px 14px;text-align:right;">$' + lineTotal + '</td>'
      + '</tr>';
  };

  const buildImageBlockOwner = (d, i) => {
    if (!d.imageUrl || d.imageUrl === 'No image') {
      return '<p style="color:red;">Design ' + (i + 1) + ': No image uploaded</p>';
    }
    // A PDF can't render via <img> — email clients just show a broken icon —
    // so link-only for those (all upload-flow PDFs) instead of also embedding.
    const isPdfFile = d.imageUrl.toLowerCase().endsWith('.pdf');
    return '<div style="margin-bottom:16px;">'
      + (designs.length > 1 ? '<p style="font-weight:600;margin:0 0 6px;">Design ' + (i + 1) + ':</p>' : '')
      + '<p><a href="' + d.imageUrl + '" style="background:#1B6B4A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px;">Download ' + (isPdfFile ? 'PDF' : 'Image') + (designs.length > 1 ? ' ' + (i + 1) : '') + '</a></p>'
      + (isPdfFile ? '' : '<img src="' + d.imageUrl + '" style="max-width:240px;border-radius:8px;border:1px solid #e5e7eb;" />')
      + (d.notes && d.notes !== 'None' ? '<p style="margin:8px 0 0;font-size:13px;color:#6b7280;"><em>Note: ' + d.notes + '</em></p>' : '')
      + (d.shape === 'bwsheet' ? '<p style="margin:8px 0 0;font-size:13px;font-weight:bold;color:#B45309;background:#FEF3C7;padding:6px 10px;border-radius:4px;">⚠️ Product: B&W Half Sheet (GRAYSCALE — print in black and white)</p>' : '')
      + (d.shape === 'waferletter' ? '<p style="margin:8px 0 0;font-size:13px;font-weight:bold;color:#B45309;background:#FEF3C7;padding:6px 10px;border-radius:4px;">⚠️ Product: Wafer Paper — Letter Sheet (NOT icing sheet — do not substitute)</p>' : '')
      + (d.sourceType === 'upload' ? '<p style="margin:8px 0 0;font-size:13px;font-weight:bold;color:#B45309;background:#FEF3C7;padding:6px 10px;border-radius:4px;">⚠️ CUSTOMER-SUPPLIED FILE — print exactly as provided, no adjustments' + (d.pageCount > 1 ? ' (page ' + d.selectedPage + ' of ' + d.pageCount + ')' : '') + '.</p>' : '')
      + '</div>';
  };

  const urgentBanner = savedRecord.urgentFlags?.length
    ? '<div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;margin-bottom:16px;border-radius:0 6px 6px 0;">'
      + '<strong>⚡ Urgent:</strong> ' + savedRecord.urgentFlags.map(urgentFlagLabel).join(' · ')
      + '</div>'
    : '';

  const ownerHtml = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">'
    + (isTest ? '<div style="background:#F59E0B;color:white;padding:10px;text-align:center;border-radius:8px 8px 0 0;font-weight:bold;">⚠️ TEST ORDER — Not a real payment</div>' : '')
    + '<div style="background:#1B6B4A;color:white;padding:20px;' + (isTest ? '' : 'border-radius:8px 8px 0 0;') + '">'
    + '<img src="' + LOGO_URL + '" alt="EdiblePrint.net" width="44" height="44" style="display:block;margin-bottom:10px;" />'
    + '<h1 style="margin:0;font-size:22px;">New Order: ' + orderId + '</h1>'
    + '<p style="margin:8px 0 0;opacity:0.9;">Total: $' + totalAmt.toFixed(2) + ' CAD &nbsp;|&nbsp; ' + designs.length + ' design' + (designs.length > 1 ? 's' : '') + '</p>'
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">'
    + urgentBanner
    + (printPdfUrls.length > 0
        ? '<p>' + printPdfUrls.map(p =>
            '<a href="' + p.url + '" style="background:#1D4ED8;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin-right:8px;">🖨️ ' + p.label + ' — Print-Ready PDF</a>'
          ).join('') + '</p>'
        : '')
    + '<h3 style="color:#1B6B4A;margin-top:16px;">Customer</h3>'
    + '<p><strong>' + meta.customerName + '</strong><br/>' + session.customer_email + '<br/>' + (meta.customerPhone || '—') + '</p>'
    + '<h3 style="color:#1B6B4A;">Shipping</h3>'
    + '<p>' + (isPickup ? 'PICKUP — East London' : (meta.shippingAddress + '<br/>' + meta.shippingCity + ', ' + meta.shippingProvince + ' ' + meta.shippingPostal)) + '<br/>Method: ' + shippingLabel + '</p>'
    + '<h3 style="color:#1B6B4A;">Designs</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1B6B4A;color:white;"><th style="padding:8px 14px;text-align:left;">Item</th><th style="padding:8px 14px;text-align:left;">Details</th><th style="padding:8px 14px;text-align:right;">Price</th></tr></thead>'
    + '<tbody>' + designs.map(buildDesignRowsOwner).join('') + '</tbody>'
    + '</table>'
    + '<h3 style="color:#1B6B4A;margin-top:20px;">Customer Images</h3>'
    + designs.map(buildImageBlockOwner).join('')
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
    + (meta.designConfirmed === 'true' ? '<p style="font-size:13px;color:#059669;background:#ECFDF5;padding:8px 12px;border-radius:6px;">✓ Design responsibility accepted by customer at: ' + (meta.designConfirmedAt || 'unknown time') + '</p>' : '<p style="font-size:13px;color:#DC2626;background:#FEF2F2;padding:8px 12px;border-radius:6px;">⚠️ Design confirmation not recorded.</p>')
    + '<p style="font-size:13px;color:#6b7280;"><a href="https://dashboard.stripe.com/payments/' + session.payment_intent + '">View in Stripe Dashboard</a>'
    + ' &nbsp;|&nbsp; <a href="' + savedRecord.assets.cloudinaryFolder + '">Cloudinary Folder</a></p>'
    + CASL_FOOTER_HTML
    + '</div></div>';

  const ownerText = 'New Order: ' + orderId + '\n'
    + 'Total: $' + totalAmt.toFixed(2) + ' CAD | ' + designs.length + ' design' + (designs.length > 1 ? 's' : '') + '\n\n'
    + (printPdfUrls.length > 0 ? printPdfUrls.map(p => p.label + ': ' + p.url).join('\n') + '\n' : '')
    + '\nCustomer\n' + meta.customerName + '\n' + session.customer_email + '\n' + (meta.customerPhone || '—') + '\n'
    + '\nShipping\n' + (isPickup ? 'PICKUP — East London' : (meta.shippingAddress + ', ' + meta.shippingCity + ', ' + meta.shippingProvince + ' ' + meta.shippingPostal)) + '\nMethod: ' + shippingLabel + '\n'
    + '\nDesigns\n' + designs.map((d, i) => (designs.length > 1 ? 'Design ' + (i + 1) : 'Print') + ': ' + d.qty + 'x ' + d.size + ' (' + (SHAPE_LABELS[d.shape] || d.shape) + ') — $' + (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2)).join('\n')
    + '\n\nStripe: https://dashboard.stripe.com/payments/' + session.payment_intent
    + '\nCloudinary Folder: ' + savedRecord.assets.cloudinaryFolder
    + '\n' + CASL_FOOTER_TEXT;

  try {
    await withRetry(async () => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'EdiblePrint.net Orders <orders@edibleprint.net>',
          to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com'],
          reply_to: 'edibleprintorders@gmail.com',
          subject: (isTest ? '[TEST] ' : '') + 'New Order ' + orderId + ' — ' + designs.length + ' design' + (designs.length > 1 ? 's' : '') + ' — $' + totalAmt.toFixed(2) + ' CAD',
          html: ownerHtml,
          text: ownerText,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        console.error('Resend owner email error:', r.status, body);
        throw new Error('Owner email HTTP ' + r.status + ': ' + body);
      }
    }, 'ownerEmail:' + orderId);
    await recordNotification(orderId, { ownerEmailSent: true });
  } catch (err) {
    await recordNotification(orderId, { ownerEmailSent: false });
    throw err;
  }

  // 5. Customer confirmation email
  const buildDesignRowsCustomer = (d, i) => {
    const shapeLabel = SHAPE_LABELS[d.shape] || d.shape;
    const lineTotal  = (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2);
    return '<tr' + (i % 2 === 0 ? ' style="background:#f3f4f6;"' : '') + '>'
      + '<td style="padding:10px 14px;font-weight:600;color:#374151;">' + (designs.length > 1 ? 'Design ' + (i + 1) : 'Your Print') + '</td>'
      + '<td style="padding:10px 14px;">' + d.qty + 'x ' + d.size + ' (' + shapeLabel + ')</td>'
      + '<td style="padding:10px 14px;text-align:right;">$' + lineTotal + '</td>'
      + '</tr>';
  };

  const buildImagePreviewCustomer = (d, i) => {
    if (!d.imageUrl || d.imageUrl === 'No image') return '';
    if (d.imageUrl.toLowerCase().endsWith('.pdf')) {
      // A PDF can't render via <img> in an email client — link instead.
      return '<div style="text-align:center;margin-bottom:12px;">'
        + (designs.length > 1 ? '<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Design ' + (i + 1) + '</p>' : '')
        + '<a href="' + d.imageUrl + '" style="font-size:13px;color:#1B6B4A;">📄 View your PDF</a>'
        + '</div>';
    }
    return '<div style="text-align:center;margin-bottom:12px;">'
      + (designs.length > 1 ? '<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Design ' + (i + 1) + '</p>' : '')
      + '<img src="' + d.imageUrl + '" style="max-width:160px;border-radius:8px;border:1px solid #e5e7eb;" alt="Design ' + (i + 1) + '" />'
      + '</div>';
  };

  const customerHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#1B6B4A;color:white;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">'
    + '<img src="' + LOGO_URL + '" alt="EdiblePrint.net" width="64" height="64" style="display:block;margin:0 auto 12px;" />'
    + '<h1 style="margin:0 0 8px;font-size:26px;letter-spacing:-0.5px;">Thank you for your order!</h1>'
    + '<p style="margin:0;font-size:16px;opacity:0.9;">Order <strong>#' + orderId + '</strong></p>'
    + '</div>'
    + '<div style="border:1px solid #e5e7eb;border-top:none;padding:28px 24px;border-radius:0 0 8px 8px;">'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">'
    + '<thead><tr style="background:#1B6B4A;color:white;"><th style="padding:10px 14px;text-align:left;">Item</th><th style="padding:10px 14px;text-align:left;">Details</th><th style="padding:10px 14px;text-align:right;">Price</th></tr></thead>'
    + '<tbody>' + designs.map(buildDesignRowsCustomer).join('') + '</tbody>'
    + '</table>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-top:2px solid #e5e7eb;">'
    + (designs.length > 1 ? '<tr><td style="padding:9px 14px;color:#374151;">Subtotal</td><td style="padding:9px 14px;text-align:right;">$' + subtotalAmt.toFixed(2) + '</td></tr>' : '')
    + '<tr style="background:#f9fafb;"><td style="padding:9px 14px;color:#374151;">Shipping (' + shippingLabel + ')</td><td style="padding:9px 14px;text-align:right;">' + (shippingAmt === 0 ? 'Free' : '$' + shippingAmt.toFixed(2)) + '</td></tr>'
    + '<tr style="background:#E8F5EE;border-top:2px solid #1B6B4A;"><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;">Total</td><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;text-align:right;">$' + totalAmt.toFixed(2) + ' CAD</td></tr>'
    + '<tr><td colspan="2" style="padding:2px 14px 0;text-align:right;font-size:11px;color:#9ca3af;">Final price — no tax charged</td></tr>'
    + '</table>'
    + (designs.some(d => d.imageUrl && d.imageUrl !== 'No image')
      ? '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:20px;">' + designs.map(buildImagePreviewCustomer).join('') + '</div>'
      : '')
    + '<div style="background:#f9fafb;border-left:4px solid #1B6B4A;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
    + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">'
    + (designs.every(d => d.sourceType === 'upload')
        ? 'Your file' + (designs.length > 1 ? 's' : '') + ' will be printed exactly as you approved — no review or changes needed.'
        : 'We\'ll review your image' + (designs.length > 1 ? 's' : '') + ' within 24 hours and contact you if any adjustments are needed.'
          + (designs.some(d => d.sourceType === 'upload') ? ' (Files uploaded through "I already have my design" print exactly as approved, without review.)' : ''))
    + '</p>'
    + '</div>'
    + (isPickup
      ? '<div style="background:#FFF4EB;border-left:4px solid #E8873C;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
        + '<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;">Pickup Address</p>'
        + '<p style="margin:0;font-size:16px;font-weight:700;line-height:1.6;color:#374151;">' + BUSINESS_ADDRESS_ONE_LINE + '</p>'
        + '<p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">Please wait for our confirmation email with your pickup time.</p>'
        + '</div>'
      : '')
    + '<div style="background:#E8F5EE;border-radius:6px;padding:14px 16px;margin-bottom:20px;text-align:center;">'
    + '<p style="margin:0;font-size:14px;color:#374151;">Questions about your order? Text or WhatsApp us at <a href="sms:' + BUSINESS_PHONE_DISPLAY.replace(/-/g, '') + '" style="color:#1B6B4A;font-weight:700;font-size:16px;">' + BUSINESS_PHONE_DISPLAY + '</a></p>'
    + '</div>'
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />'
    + '<p style="font-size:13px;color:#6b7280;text-align:center;margin:0;">Questions? Reply to this email or contact <a href="mailto:edibleprintorders@gmail.com" style="color:#1B6B4A;">edibleprintorders@gmail.com</a></p>'
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
    + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;line-height:1.6;">This email serves as your official receipt.<br/>EdiblePrint.net — ' + BUSINESS_ADDRESS_ONE_LINE + '</p>'
    + '</div></div>';

  const customerText = 'Thank you for your order!\n'
    + 'Order #' + orderId + '\n\n'
    + designs.map((d, i) => (designs.length > 1 ? 'Design ' + (i + 1) : 'Your Print') + ': ' + d.qty + 'x ' + d.size + ' (' + (SHAPE_LABELS[d.shape] || d.shape) + ') — $' + (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2)).join('\n')
    + '\n\n' + (designs.length > 1 ? 'Subtotal: $' + subtotalAmt.toFixed(2) + '\n' : '')
    + 'Shipping (' + shippingLabel + '): ' + (shippingAmt === 0 ? 'Free' : '$' + shippingAmt.toFixed(2)) + '\n'
    + 'Total: $' + totalAmt.toFixed(2) + ' CAD (final price — no tax charged)\n\n'
    + (designs.every(d => d.sourceType === 'upload')
        ? 'Your file' + (designs.length > 1 ? 's' : '') + ' will be printed exactly as you approved — no review or changes needed.\n\n'
        : 'We\'ll review your image' + (designs.length > 1 ? 's' : '') + ' within 24 hours and contact you if any adjustments are needed.\n\n')
    + (isPickup
        ? 'Pickup Address\n' + BUSINESS_ADDRESS_ONE_LINE + '\nPlease wait for our confirmation email with your pickup time.\n\n'
        : '')
    + 'Questions about your order? Text or WhatsApp us at ' + BUSINESS_PHONE_DISPLAY + '\n\n'
    + 'Questions? Reply to this email or contact edibleprintorders@gmail.com\n\n'
    + 'This email serves as your official receipt.\n'
    + 'EdiblePrint.net — ' + BUSINESS_ADDRESS_ONE_LINE;

  try {
    await withRetry(async () => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'EdiblePrint.net <orders@edibleprint.net>',
          to: [session.customer_email],
          reply_to: 'edibleprintorders@gmail.com',
          subject: 'Order Confirmed — EdiblePrint.net #' + orderId,
          html: customerHtml,
          text: customerText,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        console.error('Resend customer email error:', r.status, body);
        throw new Error('Customer email HTTP ' + r.status + ': ' + body);
      }
    }, 'customerEmail:' + orderId);
    await recordNotification(orderId, { customerEmailSent: true });
  } catch (err) {
    console.error('Customer confirmation email failed for', orderId, '— order already processed, not failing pipeline:', err.message);
    await recordNotification(orderId, { customerEmailSent: false, customerEmailError: err.message });
    await sendCustomerEmailFailedAlert(orderId, session.customer_email, err);
  }

  console.log('Order pipeline complete:', orderId, '| PDF:', pdfUrl);
}

// Stripe sends GET/HEAD to verify the endpoint is reachable before delivering events.
// Next.js App Router returns 405 for unlisted methods, which causes Stripe to mark
// the endpoint as failing. This handler makes the verification succeed.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request) {
  const body      = await request.text();
  const signature = request.headers.get('stripe-signature');
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = 'EP-' + session.id.slice(-8).toUpperCase();
    console.log('--- NEW ORDER: ' + orderId + (isTest ? ' [TEST]' : '') + ' ---');

    // Respond to Stripe immediately, then run the pipeline after the response
    // is committed. `after()` tells Vercel to keep this function instance alive
    // until the callback completes — without it, the process is killed when the
    // response is sent and Resend/Cloudinary calls never execute.
    after(async () => {
      try {
        await processOrder(session, orderId);
      } catch (err) {
        console.error('Order pipeline failed for', orderId, err);
        if (!err.alreadyAlerted) {
          await sendAlertEmail(orderId, err.message);
        }
      }
    });
  }

  return NextResponse.json({ received: true });
}
