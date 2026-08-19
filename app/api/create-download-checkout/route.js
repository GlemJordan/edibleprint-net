import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { isValidEmail } from '../../../lib/validate-email.js';
import { isWholeSheetShape, sheetFormatLabel, shapeDisplayLabel, customShapeLabel } from '../../../lib/paper-config.js';

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);
const stripe = new Stripe(stripeKey);

export async function POST(request) {
  const { imageDataUrl, shape, sizeInches, customW, customH, customShapeKind, email } = await request.json();

  // This purchase's whole point is emailing the customer their PDF (see
  // app/api/generate-pdf/route.js) — unlike checkout's customerEmail, this
  // field isn't optional in practice, so it's required here too.
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://edibleprint.net';

  // Upload image to Cloudinary so we can store a short URL in Stripe metadata
  const uploadResp = await fetch(`${baseUrl}/api/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageData: imageDataUrl,
      fileName: `download_${Date.now()}.png`,
    }),
  });
  const { url: cloudinaryUrl } = await uploadResp.json();

  // Whole-sheet shapes (fullsheet/bwsheet/multicircle/waferletter) have no
  // per-item size — labeling them with the sheet's own raw width would show
  // a long unformatted number in the Stripe line item, so they get the
  // sheet format (A4) instead.
  const customPrefix = shape === 'custom' && customShapeKind && customShapeKind !== 'rectangle'
    ? customShapeLabel(customShapeKind) + ' ' : '';
  const sizeLabel = shape === 'custom'
    ? `${customPrefix}${customW}" × ${customH}"`
    : isWholeSheetShape(shape) ? sheetFormatLabel(shape)
    : sizeInches ? `${sizeInches}"` : '';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: 'EdiblePrint Digital Download',
          description: `${shapeDisplayLabel(shape)} ${sizeLabel} — print-ready PDF (A4)`,
        },
        unit_amount: parseInt(process.env.DOWNLOAD_PDF_PRICE_CENTS || '399'),
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: email || undefined,
    success_url: `${baseUrl}/download-pdf?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?download_cancelled=true`,
    metadata: {
      type: 'pdf_download',
      shape,
      sizeInches: String(sizeInches || ''),
      customW: String(customW || ''),
      customH: String(customH || ''),
      customShapeKind: customShapeKind || '',
      cloudinaryUrl: cloudinaryUrl || '',
    },
  });

  return NextResponse.json({ url: session.url });
}
