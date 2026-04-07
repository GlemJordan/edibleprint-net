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
