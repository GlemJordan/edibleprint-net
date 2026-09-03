import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getShippingCost } from '../../../lib/shipping-config.js';
import { CATALOG_PRICES, customShapePrice } from '../../../lib/catalog-prices.js';
import { isValidEmail } from '../../../lib/validate-email.js';
import { shapeSupportsMaterial, resolveMaterial } from '../../../lib/material-config.js';
import { shapeSupportsCut, cutSurchargeFor } from '../../../lib/cutting-config.js';

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

    if (!isValidEmail(customerEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Shipping cost is computed server-side from the flat-rate config, never
    // trusted from the client, so the charged amount can't be tampered with.
    const shippingCost = getShippingCost(shippingMethod);

    // Every design's price is recomputed here from the catalog (by shape +
    // sizeId, or the area formula for shape === 'custom') and never trusted
    // from the client — the same principle already applied to shipping.
    // Fails closed: an unrecognized shape/sizeId rejects the request rather
    // than falling back to whatever price the client sent. Removing/editing
    // a design client-side can only ever reduce what's in this request, and
    // every remaining line still gets its own price recomputed here, so
    // neither action can be used to change what Stripe actually charges.
    // Material (icing vs wafer, lib/material-config.js) validated the same
    // fail-closed way as price: for a shape that offers a material choice,
    // the client must send a recognized value or the request is rejected —
    // silently defaulting an unrecognized value to icing risks printing a
    // customer's wafer order on the wrong stock with no error anywhere.
    // For a shape that doesn't offer the choice (bwsheet), material is
    // forced to icing regardless of what the client sent — there's no UI
    // for it there, so nothing legitimate would ever send anything else.
    let priceError = null;
    const designsSafe = designs.map((d) => {
      const price = d.shape === 'custom'
        ? customShapePrice(d.customW, d.customH)
        : CATALOG_PRICES[d.shape]?.[d.sizeId];
      if (price == null) {
        priceError = `Unrecognized price for shape "${d.shape}" size "${d.sizeId}"`;
        return d;
      }
      // Cut-to-shape surcharge (lib/cutting-config.js): same fail-closed
      // treatment as material below — forced to false/no-charge for a
      // shape+size that doesn't currently offer it (including while the
      // CUTTING_ENABLED flag is off, or for a multicircle size still
      // awaiting its timed price — shapeSupportsCut() already covers both),
      // regardless of what the client sent. There's no UI to send anything
      // else from legitimately.
      const cutToShape = shapeSupportsCut(d.shape, d.sizeId) && d.cutToShape === true;
      const cutSurcharge = cutToShape ? cutSurchargeFor(d.shape, d.sizeId) : 0;
      if (shapeSupportsMaterial(d.shape)) {
        if (d.material !== 'icing' && d.material !== 'wafer') {
          priceError = `Unrecognized material "${d.material}" for shape "${d.shape}"`;
          return d;
        }
        return { ...d, unitPrice: price + cutSurcharge, cutToShape };
      }
      return { ...d, unitPrice: price + cutSurcharge, material: 'icing', cutToShape };
    });
    if (priceError) {
      return NextResponse.json({ error: priceError }, { status: 400 });
    }

    // Per-design line items
    const designLineItems = designsSafe.map((d, i) => ({
      price_data: {
        currency: 'cad',
        product_data: {
          name: (designs.length > 1 ? 'Design ' + (i + 1) + ': ' : 'Edible Print: ') + d.quantity + 'x ' + d.size + ' (' + d.shape + ')',
          description: d.sourceType === 'upload'
            ? 'Customer-supplied print-ready file, printed as-is on ' + (resolveMaterial(d) === 'wafer' ? 'wafer paper' : 'premium icing sheet')
            : resolveMaterial(d) === 'wafer'
              ? 'Custom edible image print on wafer paper'
              : 'Custom edible image print on premium icing sheet',
        },
        unit_amount: Math.round(d.unitPrice * d.quantity * 100),
      },
      quantity: 1,
    }));

    const shippingAmount = Math.round(shippingCost * 100);

    // Per-design metadata (max 5 designs × 7 base keys = 35 + 9 customer
    // keys = 44 total; Stripe's hard cap is 50 keys). d{i}_uploadMeta and
    // d{i}_catalogId/d{i}_customText are each only added for their own flow
    // (upload / catalog respectively — a design is never both), so ordinary
    // editor orders never get closer to the cap than they already were.
    // Each pair also doubles as its own sourceType marker: presence on a
    // design means "customer-supplied file" / "ready-made catalog design",
    // absence means the existing editor flow, so no separate
    // d{i}_sourceType key is needed for either.
    //
    // cutToShape is packed into ONE key (cutFlags, one '0'/'1' char per
    // design index) instead of a d{i}_cutToShape key per design — the
    // budget above is already tight enough that 5 more keys for a feature
    // that's off by default (lib/cutting-config.js) isn't worth risking a
    // 5-design order tipping over Stripe's cap.
    const designMeta = { designCount: String(designs.length) };
    designMeta.cutFlags = designsSafe.slice(0, 5).map((d) => (d.cutToShape ? '1' : '0')).join('');
    designsSafe.slice(0, 5).forEach((d, i) => {
      designMeta['d' + i + '_shape']    = String(d.shape || '').slice(0, 500);
      designMeta['d' + i + '_material'] = String(d.material || 'icing').slice(0, 20);
      designMeta['d' + i + '_size']     = String(d.size  || '').slice(0, 500);
      designMeta['d' + i + '_qty']      = String(d.quantity);
      designMeta['d' + i + '_price']    = String(d.unitPrice);
      designMeta['d' + i + '_notes']    = String(d.notes || '').slice(0, 500);
      designMeta['d' + i + '_imageUrl'] = String(d.imageUrl || 'No image').slice(0, 500);
      if (d.sourceType === 'upload') {
        designMeta['d' + i + '_uploadMeta'] = (
          'page=' + (d.selectedPage || 1) +
          ';pages=' + (d.pageCount || 1) +
          ';approvedAt=' + (d.approvedAt || '')
        ).slice(0, 500);
      }
      // catalogDesignId's mere presence marks this as a ready-made-design
      // order (app/designs/[id]/page.js) — same "presence is the marker,
      // no separate d{i}_sourceType key" convention as d{i}_uploadMeta above.
      if (d.catalogDesignId) {
        designMeta['d' + i + '_catalogId']   = String(d.catalogDesignId).slice(0, 200);
        designMeta['d' + i + '_customText']  = String(d.customText || '').slice(0, 200);
      }
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
