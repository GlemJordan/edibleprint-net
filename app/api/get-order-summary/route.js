import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? process.env.STRIPE_SECRET_KEY_TEST
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

const stripe = new Stripe(stripeKey);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const meta = session.metadata || {};
    const orderId = 'EP-' + session.id.slice(-8).toUpperCase();
    const designCount = parseInt(meta.designCount || '1', 10);
    const items = [];
    for (let i = 0; i < Math.min(designCount, 5); i++) {
      if (meta['d' + i + '_shape']) {
        items.push({
          item_id: meta['d' + i + '_shape'] + '_' + (meta['d' + i + '_size'] || '').replace(/[^a-z0-9]/gi, ''),
          item_name: (meta['d' + i + '_size'] || '') + ' (' + (meta['d' + i + '_shape'] || '') + ')',
          quantity: parseInt(meta['d' + i + '_qty'] || '1', 10),
          price: parseFloat(meta['d' + i + '_price'] || '0'),
        });
      }
    }
    return NextResponse.json({
      transaction_id: orderId,
      value: session.amount_total / 100,
      currency: 'CAD',
      items,
    });
  } catch (err) {
    console.error('get-order-summary error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
