import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const isTest = process.env.STRIPE_MODE === 'test';
const stripeKey = isTest
  ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);
const stripe = new Stripe(stripeKey);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ verified: false, error: 'Missing session_id' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' && session.metadata?.type === 'pdf_download') {
      return NextResponse.json({
        verified: true,
        shape: session.metadata.shape,
        sizeInches: parseFloat(session.metadata.sizeInches) || null,
        customW: parseFloat(session.metadata.customW) || null,
        customH: parseFloat(session.metadata.customH) || null,
        cloudinaryUrl: session.metadata.cloudinaryUrl,
      });
    }

    return NextResponse.json({ verified: false }, { status: 403 });
  } catch (e) {
    console.error('verify-download-session error:', e);
    return NextResponse.json({ verified: false, error: e.message }, { status: 500 });
  }
}
