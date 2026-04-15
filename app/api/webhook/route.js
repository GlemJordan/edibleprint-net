import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? process.env.STRIPE_SECRET_KEY_TEST
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);
const webhookSecret = isTest
  ? process.env.STRIPE_WEBHOOK_SECRET_TEST
  : (process.env.STRIPE_WEBHOOK_SECRET);

const stripe = new Stripe(stripeKey);

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
    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EdiblePrint.net Orders <onboarding@resend.dev>',
          to: [process.env.ORDER_NOTIFICATION_EMAIL || 'glenj.belmar@gmail.com'],
          subject: (isTest ? '[TEST] ' : '') + 'New Order ' + orderId + ' - $' + (session.amount_total / 100).toFixed(2) + ' CAD',
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
            + (isTest ? '<div style="background:#F59E0B;color:white;padding:10px;text-align:center;border-radius:8px 8px 0 0;font-weight:bold;">⚠️ TEST ORDER — Not a real payment</div>' : '')
            + '<div style="background:#1B6B4A;color:white;padding:20px;' + (isTest ? '' : 'border-radius:8px 8px 0 0;') + '">'
            + '<h1 style="margin:0;font-size:22px;">New Order: ' + orderId + '</h1>'
            + '<p style="margin:8px 0 0;opacity:0.9;">Total: $' + (session.amount_total / 100).toFixed(2) + ' CAD</p>'
            + '</div>'
            + '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">'
            + '<h3 style="color:#1B6B4A;margin-top:0;">Customer</h3>'
            + '<p><strong>' + meta.customerName + '</strong><br/>'
            + session.customer_email + '<br/>'
            + meta.customerPhone + '</p>'
            + '<h3 style="color:#1B6B4A;">Shipping</h3>'
            + '<p>' + meta.shippingAddress + '<br/>'
            + meta.shippingCity + ', ' + meta.shippingProvince + ' ' + meta.shippingPostal + '<br/>'
            + 'Method: ' + (meta.shippingMethod === 'express' ? 'Express (1-2 days)' : meta.shippingMethod === 'local' ? 'Same Day Delivery' : 'Standard (3-5 days)') + '</p>'
            + '<h3 style="color:#1B6B4A;">Order Details</h3>'
            + '<p>Shape: ' + meta.shape + '<br/>'
            + 'Size: ' + meta.size + '<br/>'
            + 'Quantity: ' + meta.quantity + '<br/>'
            + 'Unit Price: $' + meta.unitPrice + '</p>'
            + (meta.notes !== 'None' ? '<h3 style="color:#1B6B4A;">Notes</h3><p>' + meta.notes + '</p>' : '')
            + '<h3 style="color:#1B6B4A;">Customer Image</h3>'
            + (meta.imageUrl && meta.imageUrl !== 'No image'
              ? '<p><a href="' + meta.imageUrl + '" style="background:#1B6B4A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Download Image</a></p><br/><img src="' + meta.imageUrl + '" style="max-width:300px;border-radius:8px;border:1px solid #e5e7eb;" />'
              : '<p style="color:red;">No image uploaded</p>')
            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
            + '<p style="font-size:13px;color:#6b7280;"><a href="https://dashboard.stripe.com/payments/' + session.payment_intent + '">View in Stripe Dashboard</a></p>'
            + '</div></div>',
        }),
      });
      if (!emailResponse.ok) {
        console.error('Email send failed:', await emailResponse.text());
      } else {
        console.log('Email notification sent for ' + orderId);
      }

      /* ── Customer confirmation email ── */
      const shippingLabel = meta.shippingMethod === 'express' ? 'Express Shipping (1–2 business days)'
        : meta.shippingMethod === 'local' ? 'Same Day Delivery — London, ON'
        : meta.shippingMethod === 'pickup' ? 'Pickup — London, ON'
        : 'Standard Shipping (3–5 business days)';
      const isPickup = meta.shippingMethod === 'pickup';

      const customerEmailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EdiblePrint.net <onboarding@resend.dev>',
          to: [session.customer_email],
          subject: 'Order Confirmed — EdiblePrint.net #' + orderId,
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">'
            + '<div style="background:#1B6B4A;color:white;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">'
            + '<h1 style="margin:0 0 8px;font-size:26px;letter-spacing:-0.5px;">Thank you for your order!</h1>'
            + '<p style="margin:0;font-size:16px;opacity:0.9;">Order <strong>#' + orderId + '</strong></p>'
            + '</div>'
            + '<div style="border:1px solid #e5e7eb;border-top:none;padding:28px 24px;border-radius:0 0 8px 8px;">'

            + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">'
            + '<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;width:40%;color:#374151;">Shape</td><td style="padding:10px 14px;">' + meta.shape + '</td></tr>'
            + '<tr><td style="padding:10px 14px;font-weight:600;color:#374151;">Size</td><td style="padding:10px 14px;">' + meta.size + '</td></tr>'
            + '<tr style="background:#f3f4f6;"><td style="padding:10px 14px;font-weight:600;color:#374151;">Quantity</td><td style="padding:10px 14px;">' + meta.quantity + '</td></tr>'
            + '<tr><td style="padding:10px 14px;font-weight:600;color:#374151;">Shipping</td><td style="padding:10px 14px;">' + shippingLabel + '</td></tr>'
            + '<tr style="background:#E8F5EE;"><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;">Total</td><td style="padding:12px 14px;font-weight:700;font-size:16px;color:#1B6B4A;">$' + (session.amount_total / 100).toFixed(2) + ' CAD</td></tr>'
            + '</table>'

            + (meta.imageUrl && meta.imageUrl !== 'No image'
              ? '<div style="text-align:center;margin-bottom:20px;"><img src="' + meta.imageUrl + '" style="max-width:200px;border-radius:8px;border:1px solid #e5e7eb;" alt="Your uploaded image" /></div>'
              : '')

            + '<div style="background:#f9fafb;border-left:4px solid #1B6B4A;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
            + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">We\'ll review your image within 24 hours and contact you if any adjustments are needed.</p>'
            + '</div>'

            + (isPickup
              ? '<div style="background:#FFF4EB;border-left:4px solid #E8873C;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
              + '<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">We\'ll email you the pickup address and available times shortly.</p>'
              + '</div>'
              : '')

            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />'
            + '<p style="font-size:13px;color:#6b7280;text-align:center;margin:0;">Questions? Reply to this email or contact <a href="mailto:hello@edibleprint.net" style="color:#1B6B4A;">hello@edibleprint.net</a></p>'
            + '</div></div>',
        }),
      });
      if (!customerEmailResponse.ok) {
        console.error('Customer email send failed:', await customerEmailResponse.text());
      } else {
        console.log('Customer confirmation email sent for ' + orderId);
      }
    } catch (emailError) {
      console.error('Email error:', emailError);
    }
  }
  return NextResponse.json({ received: true });
}
