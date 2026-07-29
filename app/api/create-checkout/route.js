import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getShippingCost } from '../../../lib/shipping-config.js';
import { WAFER_PAPER_PRICE } from '../../../lib/wafer-paper-config.js';

const isTest = process.env.STRIPE_MODE === 'test';
// NOTE: STRIPE_SECRET_KEY_LIVE must be sk_live_... (a full Secret Key).
// If it starts with rk_live_... it is a Restricted Key and cannot create Checkout Sessions.
const stripeKey = isTest
  ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

// Publishable key follows the same test/live split so frontend and backend stay in sync.
// Deprecated NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY kept as final fallback.
export const stripePublishableKey = isTest
  ? (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST  || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE  || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const stripe = new Stripe(stripeKey);

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      customerName, customerEmail, customerPhone,
      shippingAddress, shippingCity, shippingProvince, shippingPostal,
      shippingMethod,
      designConfirmed, designConfirmedAt,
      designs,
    } = body;

    if (!designs || designs.length === 0) {
      return NextResponse.json({ error: 'No designs provided' }, { status: 400 });
    }

    // Shipping cost is computed server-side from the flat-rate config, never
    // trusted from the client, so the charged amount can't be tampered with.
    const shippingCost = getShippingCost(shippingMethod);

    // Wafer paper is a flat rate — like shipping, its price is enforced
    // server-side from the shared config rather than trusted from the client.
    const designsSafe = designs.map((d) =>
      d.shape === 'waferletter' ? { ...d, unitPrice: WAFER_PAPER_PRICE } : d
    );

    // Per-design line items
    const designLineItems = designsSafe.map((d, i) => ({
      price_data: {
        currency: 'cad',
        product_data: {
          name: (designs.length > 1 ? 'Design ' + (i + 1) + ': ' : 'Edible Print: ') + d.quantity + 'x ' + d.size + ' (' + d.shape + ')',
          description: d.shape === 'waferletter'
            ? 'Custom edible image print on wafer paper'
            : 'Custom edible image print on premium icing sheet',
        },
        unit_amount: Math.round(d.unitPrice * d.quantity * 100),
      },
      quantity: 1,
    }));

    const shippingAmount = Math.round(shippingCost * 100);

    // Per-design metadata (max 5 designs × 6 keys = 30 + 9 customer keys = 39 total)
    const designMeta = { designCount: String(designs.length) };
    designsSafe.slice(0, 5).forEach((d, i) => {
      designMeta['d' + i + '_shape']    = String(d.shape || '').slice(0, 500);
      designMeta['d' + i + '_size']     = String(d.size  || '').slice(0, 500);
      designMeta['d' + i + '_qty']      = String(d.quantity);
      designMeta['d' + i + '_price']    = String(d.unitPrice);
      designMeta['d' + i + '_notes']    = 'N/A';
      designMeta['d' + i + '_imageUrl'] = String(d.imageUrl || 'No image').slice(0, 500);
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        ...designLineItems,
        // Pickup is $0 — no shipping line item shown for it at all.
        ...(shippingMethod === 'pickup' ? [] : [{
          price_data: {
            currency: 'cad',
            product_data: { name: 'Shipping (Canada Post Shipping)' },
            unit_amount: shippingAmount,
          },
          quantity: 1,
        }]),
      ],
      metadata: {
        customerName,
        customerPhone: customerPhone || 'N/A',
        shippingAddress,
        shippingCity,
        shippingProvince,
        shippingPostal,
        shippingMethod,
        shippingCost: String(shippingCost || 0),
        designConfirmed: String(designConfirmed || false),
        designConfirmedAt: designConfirmedAt || '',
        ...designMeta,
      },
      ...(shippingMethod !== 'pickup' && shippingAddress ? {
        payment_intent_data: {
          shipping: {
            name: customerName,
            address: {
              line1: shippingAddress,
              city: shippingCity,
              state: shippingProvince,
              postal_code: shippingPostal,
              country: 'CA',
            },
          },
        },
      } : {}),
      success_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/cancel',
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return NextResponse.json({ error: 'Error creating checkout session' }, { status: 500 });
  }
}
