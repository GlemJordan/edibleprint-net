import Stripe from 'stripe';
import { NextResponse, after } from 'next/server';
import { buildOrderRecord, saveOrderRecord } from '../../../lib/order-record.js';
import { generateProductionSlip, generatePrintPdf, extractPdfPage } from '../../../lib/generate-pdf.js';
import { uploadRaw, orderFolderPath } from '../../../lib/cloudinary-ops.js';

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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, label) {
  const delays = [2000, 8000, 20000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === delays.length) throw err;
      console.warn(`[${label}] attempt ${attempt + 1} failed, retrying in ${delays[attempt]}ms:`, err.message);
      await sleep(delays[attempt]);
    }
  }
}

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
      }),
    });
  } catch (e) {
    console.error('Alert email failed:', e.message);
  }
}

async function processOrder(session, orderId) {
  const meta = session.metadata || {};
  const designs = parseDesigns(meta);
  const isPickup = meta.shippingMethod === 'pickup';

  const subtotalAmt = designs.reduce((s, d) => s + parseFloat(d.price) * parseInt(d.qty, 10), 0);
  const shippingAmt = parseFloat(meta.shippingCost) || 0;
  const totalAmt    = session.amount_total / 100;

  const shippingLabel = meta.shippingMethod === 'pickup' ? 'Pickup — East London, ON' : 'Canada Post Shipping';

  // 1. Build + save OrderRecord (order.json + notes.txt → Cloudinary)
  const record = buildOrderRecord(session, designs, orderId, isTest);
  const savedRecord = await withRetry(
    () => saveOrderRecord(record),
    'saveOrderRecord:' + orderId,
  );

  // 2. Generate production slip PDF
  const pdfOrder = {
    orderNumber:   savedRecord.orderId,
    isTest,
    createdAt:     savedRecord.createdAt,
    customerName:  savedRecord.customer.name,
    customerEmail: savedRecord.customer.email,
    customerPhone: savedRecord.customer.phone || '',
    designs:       savedRecord.designs,
    shippingLabel,
    isPickup,
    shippingLine1: savedRecord.shipping.address?.line1,
    shippingCity:  savedRecord.shipping.address?.city,
    shippingProv:  savedRecord.shipping.address?.province,
    shippingPostal: savedRecord.shipping.address?.postalCode,
    allNotes:      savedRecord.notes,
  };
  const pdfBytes = await withRetry(
    () => generateProductionSlip(pdfOrder),
    'generatePDF:' + orderId,
  );

  // 3. Upload PDF to Cloudinary
  const folder = orderFolderPath(orderId);
  const pdfPublicId = `${folder}/production-slip.pdf`;
  const pdfUrl = await withRetry(
    () => uploadRaw(pdfBytes, pdfPublicId),
    'uploadPDF:' + orderId,
  );

  // 3b. Generate + upload print-ready PDFs (one per design with an image)
  const printPdfUrls = [];
  for (let i = 0; i < designs.length; i++) {
    const d = designs[i];
    if (!d.imageUrl || d.imageUrl === 'No image') continue;
    const baseLabel = designs.length > 1 ? 'Design ' + (i + 1) : 'Print-Ready';

    if (d.sourceType === 'upload') {
      // Customer-supplied file: the ORIGINAL is always the print-ready asset
      // (byte-for-byte, no re-encoding) unless it's a multi-page PDF, in
      // which case the one selected page gets structurally extracted — see
      // extractPdfPage(). Never routed through generatePrintPdf's
      // image-embedding path, which is for editor-generated crops only.
      try {
        if (d.pageCount > 1) {
          const extractedBytes = await withRetry(
            () => extractPdfPage(d.imageUrl, d.selectedPage),
            'extractPdfPage:' + orderId + ':' + i,
          );
          const printPublicId = `${folder}/print-design${designs.length > 1 ? '-' + (i + 1) : ''}.pdf`;
          const printUrl = await withRetry(
            () => uploadRaw(extractedBytes, printPublicId),
            'uploadExtractedPage:' + orderId + ':' + i,
          );
          printPdfUrls.push({ url: printUrl, label: baseLabel + ' (page ' + d.selectedPage + ' of ' + d.pageCount + ', extracted)' });
        } else {
          printPdfUrls.push({ url: d.imageUrl, label: baseLabel + ' (customer’s original file)' });
        }
      } catch (printErr) {
        console.error('[webhook] page extraction failed for design', i, printErr.message);
      }
      continue;
    }

    const sizeInches = parseFloat(d.size) || 6;
    const customW = d.shape === 'custom' ? parseFloat(d.size.split('"x')[0]) : undefined;
    const customH = d.shape === 'custom' ? parseFloat(d.size.split('"x')[1]) : undefined;
    try {
      const printBytes = await withRetry(
        () => generatePrintPdf({ imageUrl: d.imageUrl, shape: d.shape, sizeInches, customW, customH }),
        'generatePrintPdf:' + orderId + ':' + i,
      );
      const printPublicId = `${folder}/print-design${designs.length > 1 ? '-' + (i + 1) : ''}.pdf`;
      const printUrl = await withRetry(
        () => uploadRaw(printBytes, printPublicId),
        'uploadPrintPdf:' + orderId + ':' + i,
      );
      printPdfUrls.push({ url: printUrl, label: baseLabel });
    } catch (printErr) {
      console.error('[webhook] print PDF failed for design', i, printErr.message);
    }
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
      + '<strong>⚡ Urgent:</strong> ' + savedRecord.urgentFlags.join(' · ')
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
    + '<p><a href="' + pdfUrl + '" style="background:#1B6B4A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">📄 Download Production Slip (PDF)</a></p>'
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
    + '</div></div>';

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
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error('Resend owner email error:', r.status, body);
      throw new Error('Owner email HTTP ' + r.status + ': ' + body);
    }
  }, 'ownerEmail:' + orderId);

  // 5. Customer confirmation email (unchanged logic)
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
        + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">40 Burslem St, N5W 2V7, London, ON.<br/>Please wait for our confirmation email with pickup time and exact unit.</p>'
        + '</div>'
      : '')
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />'
    + '<p style="font-size:13px;color:#6b7280;text-align:center;margin:0;">Questions? Reply to this email or contact <a href="mailto:edibleprintorders@gmail.com" style="color:#1B6B4A;">edibleprintorders@gmail.com</a></p>'
    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
    + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;line-height:1.6;">This email serves as your official receipt.<br/>EdiblePrint.net — London, Ontario.</p>'
    + '</div></div>';

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
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        console.error('Resend customer email error:', r.status, body);
        throw new Error('Customer email HTTP ' + r.status + ': ' + body);
      }
    }, 'customerEmail:' + orderId);
  } catch (err) {
    console.error('Customer confirmation email failed for', orderId, '— order already processed, not failing pipeline:', err.message);
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
        await sendAlertEmail(orderId, err.message);
      }
    });
  }

  return NextResponse.json({ received: true });
}
