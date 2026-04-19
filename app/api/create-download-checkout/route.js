import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { imageDataUrl, shape, sizeInches, customW, customH, email } = await request.json();

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

  const sizeLabel = shape === 'custom'
    ? `${customW}" × ${customH}"`
    : sizeInches ? `${sizeInches}"` : '';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: 'EdiblePrint Digital Download',
          description: `${shape} ${sizeLabel} — print-ready PDF (A4)`,
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
      cloudinaryUrl: cloudinaryUrl || '',
    },
  });

  return NextResponse.json({ url: session.url });
}
