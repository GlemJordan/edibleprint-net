import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata;
    const orderId = 'EP-' + session.id.slice(-8).toUpperCase();

    console.log('--- NEW ORDER: ' + orderId + ' ---');

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
          subject: 'New Order ' + orderId + ' - $' + (session.amount_total / 100).toFixed(2) + ' CAD',
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
            + '<div style="background:#1B6B4A;color:white;padding:20px;border-radius:8px 8px 0 0;">'
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
            + 'Method: ' + (meta.shippingMethod === 'express' ? 'Express (1-2 days)' : 'Standard (3-5 days)') + '</p>'
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
    } catch (emailError) {
      console.error('Email error:', emailError);
    }
  }

  return NextResponse.json({ received: true });
}
