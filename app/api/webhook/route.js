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
    console.log('--- NEW ORDER ---');
    console.log('Order: EP-' + session.id.slice(-8).toUpperCase());
    console.log('Total: $' + (session.amount_total / 100).toFixed(2) + ' CAD');
    console.log('Customer: ' + meta.customerName + ' / ' + session.customer_email);
    console.log('Shape: ' + meta.shape + ' / Size: ' + meta.size + ' / Qty: ' + meta.quantity);
    console.log('Ship to: ' + meta.shippingAddress + ', ' + meta.shippingCity + ', ' + meta.shippingProvince + ' ' + meta.shippingPostal);
    console.log('Notes: ' + meta.notes);
    console.log('Stripe: https://dashboard.stripe.com/payments/' + session.payment_intent);
    console.log('-----------------');
  }

  return NextResponse.json({ received: true });
}
