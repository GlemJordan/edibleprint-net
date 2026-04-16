import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? process.env.STRIPE_SECRET_KEY_TEST
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);
const webhookSecret = isTest
  ? process.env.STRIPE_WEBHOOK_SECRET_TEST
  : process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(stripeKey);

const SHAPE_LABELS = { circular: 'Round', square: 'Square', rectangular: 'Rectangle', fullsheet: 'Full Sheet', multicircle: 'Cookie Sheet', heart: 'Heart', custom: 'Custom' };

export async function POST(request) {
  const body = await request.text();
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
    const meta = session.metadata;
    const orderId = 'EP-' + session.id.slice(-8).toUpperCase();
    console.log('--- NEW ORDER: ' + orderId + (isTest ? ' [TEST]' : '') + ' ---');

    // Parse designs from metadata (supports both new multi-design and legacy single-design format)
    const designCount = parseInt(meta.designCount || '1', 10);
    const designs = [];
    for (let i = 0; i < designCount; i++) {
      if (meta['d' + i + '_shape']) {
        designs.push({
          shape: meta['d' + i + '_shape'],
          size: meta['d' + i + '_size'] || '',
          qty: meta['d' + i + '_qty'] || '1',
          price: meta['d' + i + '_price'] || '0',
          notes: meta['d' + i + '_notes'] || 'None',
          imageUrl: meta['d' + i + '_imageUrl'] || 'No image',
        });
      } else {
        // Legacy single-design fallback
        designs.push({
          shape: meta.shape || 'circular',
          size: meta.size || '',
          qty: meta.quantity || '1',
          price: meta.unitPrice || '0',
          notes: meta.notes || 'None',
          imageUrl: meta.imageUrl || 'No image',
        });
      }
    }

    const subtotalAmt = designs.reduce((s, d) => s + parseFloat(d.price) * parseInt(d.qty, 10), 0);
    const shippingAmt = parseFloat(meta.shippingCost) || 0;
    const taxAmt      = (subtotalAmt + shippingAmt) * 0.13;
    const totalAmt    = session.amount_total / 100;

    const shippingLabel = meta.shippingMethod === 'express' ? 'Express (1–2 business days)'
      : meta.shippingMethod === 'local' ? 'Same Day Delivery — London, ON'
      : meta.shippingMethod === 'pickup' ? 'Pickup — London, ON'
      : 'Standard (3–5 business days)';
    const isPickup = meta.shippingMethod === 'pickup';

    // Build design rows HTML (shared by both emails)
    const buildDesignRowsOwner = (d, i) => {
      const shapeLabel = SHAPE_LABELS[d.shape] || d.shape;
      const lineTotal = (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2);
      return '<tr style="' + (i % 2 === 0 ? 'background:#f9fafb;' : '') + '">'
        + '<td style="padding:8px 14px;font-weight:600;color:#374151;">' + (designs.length > 1 ? 'Design ' + (i + 1) : 'Print') + '</td>'
        + '<td style="padding:8px 14px;">' + d.qty + 'x ' + d.size + ' (' + shapeLabel + ')</td>'
        + '<td style="padding:8px 14px;text-align:right;">$' + lineTotal + '</td>'
        + '</tr>';
    };

    const buildImageBlockOwner = (d, i) => {
      if (!d.imageUrl || d.imageUrl === 'No image') {
        return '<p style="color:red;">Design ' + (i + 1) + ': No image uploaded</p>';
      }
      return '<div style="margin-bottom:16px;">'
        + (designs.length > 1 ? '<p style="font-weight:600;margin:0 0 6px;">Design ' + (i + 1) + ':</p>' : '')
        + '<p><a href="' + d.imageUrl + '" style="background:#1B6B4A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-size:13px;">Download Image' + (designs.length > 1 ? ' ' + (i + 1) : '') + '</a></p>'
        + '<img src="' + d.imageUrl + '" style="max-width:240px;border-radius:8px;border:1px solid #e5e7eb;" />'
        + (d.notes && d.notes !== 'None' ? '<p style="margin:8px 0 0;font-size:13px;color:#6b7280;"><em>Note: ' + d.notes + '</em></p>' : '')
        + '</div>';
    };

    try {
      // Owner notification email
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EdiblePrint.net Orders <onboarding@resend.dev>',
          to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com'],
          reply_to: 'glenj.belmar@gmail.com',
          subject: (isTest ? '[TEST] ' : '') + 'New Order ' + orderId + ' — ' + designs.length + ' design' + (designs.length > 1 ? 's' : '') + ' — $' + totalAmt.toFixed(2) + ' CAD',
          html: '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">'
            + (isTest ? '<div style="background:#F59E0B;color:white;padding:10px;text-align:center;border-radius:8px 8px 0 0;font-weight:bold;">⚠️ TEST ORDER — Not a real payment</div>' : '')
            + '<div style="background:#1B6B4A;color:white;padding:20px;' + (isTest ? '' : 'border-radius:8px 8px 0 0;') + '">'
            + '<h1 style="margin:0;font-size:22px;">New Order: ' + orderId + '</h1>'
            + '<p style="margin:8px 0 0;opacity:0.9;">Total: $' + totalAmt.toFixed(2) + ' CAD &nbsp;|&nbsp; ' + designs.length + ' design' + (designs.length > 1 ? 's' : '') + '</p>'
            + '</div>'
            + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">'
            + '<h3 style="color:#1B6B4A;margin-top:0;">Customer</h3>'
            + '<p><strong>' + meta.customerName + '</strong><br/>' + session.customer_email + '<br/>' + meta.customerPhone + '</p>'
            + '<h3 style="color:#1B6B4A;">Shipping</h3>'
            + '<p>' + (isPickup ? 'PICKUP — South London' : (meta.shippingAddress + '<br/>' + meta.shippingCity + ', ' + meta.shippingProvince + ' ' + meta.shippingPostal)) + '<br/>Method: ' + shippingLabel + '</p>'
            + '<h3 style="color:#1B6B4A;">Designs</h3>'
            + '<table style="width:100%;border-collapse:collapse;">'
            + '<thead><tr style="background:#1B6B4A;color:white;"><th style="padding:8px 14px;text-align:left;">Item</th><th style="padding:8px 14px;text-align:left;">Details</th><th style="padding:8px 14px;text-align:right;">Price</th></tr></thead>'
            + '<tbody>' + designs.map(buildDesignRowsOwner).join('') + '</tbody>'
            + '</table>'
            + '<h3 style="color:#1B6B4A;margin-top:20px;">Customer Images</h3>'
            + designs.map(buildImageBlockOwner).join('')
            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
            + '<p style="font-size:13px;color:#6b7280;"><a href="https://dashboard.stripe.com/payments/' + session.payment_intent + '">View in Stripe Dashboard</a></p>'
            + '</div></div>',
        }),
      });
      if (!emailResponse.ok) {
        console.error('Owner email failed:', await emailResponse.text());
      } else {
        console.log('Owner email sent for ' + orderId);
      }

      // Customer confirmation email
      const buildDesignRowsCustomer = (d, i) => {
        const shapeLabel = SHAPE_LABELS[d.shape] || d.shape;
        const lineTotal = (parseFloat(d.price) * parseInt(d.qty, 10)).toFixed(2);
        return '<tr' + (i % 2 === 0 ? ' style="background:#f3f4f6;"' : '') + '>'
          + '<td style="padding:10px 14px;font-weight:600;color:#374151;">' + (designs.length > 1 ? 'Design ' + (i + 1) : 'Your Print') + '</td>'
          + '<td style="padding:10px 14px;">' + d.qty + 'x ' + d.size + ' (' + shapeLabel + ')</td>'
          + '<td style="padding:10px 14px;text-align:right;">$' + lineTotal + '</td>'
          + '</tr>';
      };

      const buildImagePreviewCustomer = (d, i) => {
        if (!d.imageUrl || d.imageUrl === 'No image') return '';
        return '<div style="text-align:center;margin-bottom:12px;">'
          + (designs.length > 1 ? '<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Design ' + (i + 1) + '</p>' : '')
          + '<img src="' + d.imageUrl + '" style="max-width:160px;border-radius:8px;border:1px solid #e5e7eb;" alt="Design ' + (i + 1) + '" />'
          + '</div>';
      };

      const customerEmailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EdiblePrint.net <onboarding@resend.dev>',
          to: [session.customer_email],
          reply_to: 'glenj.belmar@gmail.com',
          subject: 'Order Confirmed — EdiblePrint.net #' + orderId,
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">'
            + '<div style="background:#1B6B4A;color:white;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">'
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
            + '<tr><td style="padding:9px 14px;color:#374151;">HST (13%)</td><td style="padding:9px 14px;text-align:right;">$' + taxAmt.toFixed(2) + '</td></tr>'
            + '<tr style="background:#E8F5EE;border-top:2px solid #1B6B4A;"><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;">Total</td><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;text-align:right;">$' + totalAmt.toFixed(2) + ' CAD</td></tr>'
            + '</table>'
            + (designs.some(d => d.imageUrl && d.imageUrl !== 'No image')
              ? '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:20px;">' + designs.map(buildImagePreviewCustomer).join('') + '</div>'
              : '')
            + '<div style="background:#f9fafb;border-left:4px solid #1B6B4A;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
            + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">We\'ll review your image' + (designs.length > 1 ? 's' : '') + ' within 24 hours and contact you if any adjustments are needed.</p>'
            + '</div>'
            + (isPickup
              ? '<div style="background:#FFF4EB;border-left:4px solid #E8873C;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
              + '<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;">Pickup Address</p>'
              + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">3 Frontenac Road N5Z 3Y1 (apartments), South London, ON.<br/>Please wait for our confirmation email with pickup time and exact address.</p>'
              + '</div>'
              : '')
            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />'
            + '<p style="font-size:13px;color:#6b7280;text-align:center;margin:0;">Questions? Reply to this email or contact <a href="mailto:hello@edibleprint.net" style="color:#1B6B4A;">hello@edibleprint.net</a></p>'
            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
            + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;line-height:1.6;">This email serves as your official receipt.<br/>EdiblePrint.net — London, Ontario. HST Registration: [pending]</p>'
            + '</div></div>',
        }),
      });
      if (!customerEmailResponse.ok) {
        console.error('Customer email failed:', await customerEmailResponse.text());
      } else {
        console.log('Customer email sent for ' + orderId);
      }
    } catch (emailError) {
      console.error('Email error:', emailError);
    }
  }
  return NextResponse.json({ received: true });
}
