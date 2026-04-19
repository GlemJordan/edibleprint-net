import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
