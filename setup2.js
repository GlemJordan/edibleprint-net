const fs = require('fs');
const path = require('path');

function createFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content.trimStart());
  console.log('Created: ' + filePath);
}

// ── API: Create Stripe Checkout ──
createFile('app/api/create-checkout/route.js', `
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      customerName, customerEmail, customerPhone,
      shippingAddress, shippingCity, shippingProvince, shippingPostal,
      shape, size, quantity, unitPrice,
      shippingMethod, shippingCost, notes,
    } = body;

    const subtotal = Math.round(unitPrice * quantity * 100);
    const shippingAmount = Math.round(shippingCost * 100);
    const taxRate = 0.13;
    const taxAmount = Math.round((subtotal + shippingAmount) * taxRate);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'Edible Print - ' + quantity + 'x ' + size + ' (' + shape + ')',
              description: 'Custom edible image print on premium icing sheet',
            },
            unit_amount: subtotal,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'Shipping (' + (shippingMethod === 'express' ? 'Express 1-2 days' : 'Standard 3-5 days') + ')',
            },
            unit_amount: shippingAmount,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'cad',
            product_data: { name: 'HST (13%)' },
            unit_amount: taxAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        customerName,
        customerPhone: customerPhone || 'N/A',
        shippingAddress,
        shippingCity,
        shippingProvince,
        shippingPostal,
        shape,
        size,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        shippingMethod,
        notes: notes || 'None',
      },
      success_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + '/cancel',
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return NextResponse.json({ error: 'Error creating checkout session' }, { status: 500 });
  }
}
`);

// ── API: Stripe Webhook ──
createFile('app/api/webhook/route.js', `
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
`);

// ── Success Page ──
createFile('app/success/page.js', `
'use client';
import { Suspense } from 'react';

function SuccessContent() {
  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F5EE',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 20 }}>
        <span role="img" aria-label="check">&#x2705;</span>
      </div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, marginBottom: 12, fontWeight: 700 }}>
        Payment Successful!
      </h1>
      <p style={{ fontSize: 17, color: '#6B7280', lineHeight: 1.65, marginBottom: 28 }}>
        Thank you for your order! We have received your payment and will review
        your image within 24 hours. A confirmation email is on its way.
      </p>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
        padding: '18px 22px', fontSize: 14, color: '#92700C', marginBottom: 28, textAlign: 'left', lineHeight: 1.7 }}>
        <strong>What happens next?</strong><br />
        1. We review your image for print quality (within 24h)<br />
        2. If adjustments are needed, we contact you by email<br />
        3. We print your edible sheet and ship via Canada Post<br />
        4. You receive it at your door!
      </div>
      <a href="/" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
        Back to Home
      </a>
      <p style={{ marginTop: 20, fontSize: 12, color: '#bbb' }}>Questions? Email edibleprintorders@gmail.com</p>
    </div>
  );
}

export default function SuccessPage() {
  return (<Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}><SuccessContent /></Suspense>);
}
`);

// ── Cancel Page ──
createFile('app/cancel/page.js', `
export default function CancelPage() {
  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px',
      maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ fontSize: 56, marginBottom: 20 }}>&#x21A9;&#xFE0F;</div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 12, fontWeight: 700 }}>
        Order Cancelled
      </h1>
      <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }}>
        No worries. Your payment was not processed. You can start a new order anytime.
      </p>
      <a href="/" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12,
        padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
        Try Again
      </a>
    </div>
  );
}
`);

console.log('');
console.log('All missing files created!');
console.log('Now run: npm run dev');
console.log('Then open: http://localhost:3000');
