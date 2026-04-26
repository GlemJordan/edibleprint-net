'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [paymentStatus, setPaymentStatus] = useState('loading');

  useEffect(() => {
    if (!sessionId) { setPaymentStatus('no_session'); return; }

    fetch('/api/get-order-summary?session_id=' + sessionId)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setPaymentStatus('error'); return; }

        const isPaid = data.payment_status === 'paid' && data.session_status === 'complete';
        setPaymentStatus(isPaid ? 'paid' : 'unpaid');

        if (!isPaid) return;

        const key = 'ep_purchase_fired_' + sessionId;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');

        if (typeof window !== 'undefined') {
          if (window.gtag) {
            window.gtag('event', 'purchase', {
              transaction_id: data.transaction_id,
              value: data.value,
              currency: data.currency,
              items: data.items,
            });

            const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
            const gadsLabel = process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL;
            if (gadsId && gadsLabel) {
              window.gtag('event', 'conversion', {
                send_to: `${gadsId}/${gadsLabel}`,
                value: data.value,
                currency: data.currency,
                transaction_id: data.transaction_id,
              });
            }
          }
          if (window.fbq) {
            window.fbq('track', 'Purchase', { value: data.value, currency: data.currency });
          }
        }
      })
      .catch(() => setPaymentStatus('error'));
  }, [sessionId]);

  const fonts = (
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
  );
  const wrap = (children) => (
    <div style={{ fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: '80px 24px', maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: '#FAFBF9' }}>
      {fonts}
      {children}
    </div>
  );

  if (paymentStatus === 'loading') {
    return wrap(<p style={{ fontSize: 17, color: '#6B7280' }}>Verifying your payment…</p>);
  }

  if (paymentStatus === 'unpaid' || paymentStatus === 'no_session' || paymentStatus === 'error') {
    return wrap(
      <>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#FEE2E2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 20 }}>
          <span role="img" aria-label="warning">&#x26A0;&#xFE0F;</span>
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 12, fontWeight: 700, color: '#B91C1C' }}>
          Payment Not Confirmed
        </h1>
        <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.65, marginBottom: 28 }}>
          We could not confirm your payment. If you completed checkout, please contact us with your order details.
        </p>
        <a href="mailto:glenj.belmar@gmail.com" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}>
          Contact Support
        </a>
        <br />
        <a href="/" style={{ fontSize: 14, color: '#6B7280' }}>Back to Home</a>
      </>
    );
  }

  return wrap(
    <>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F5EE', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 20 }}>
        <span role="img" aria-label="check">&#x2705;</span>
      </div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, marginBottom: 12, fontWeight: 700 }}>
        Payment Successful!
      </h1>
      <p style={{ fontSize: 17, color: '#6B7280', lineHeight: 1.65, marginBottom: 28 }}>
        Thank you for your order! We have received your payment and will review
        your image within 24 hours. A confirmation email is on its way.
      </p>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '18px 22px', fontSize: 14, color: '#92700C', marginBottom: 28, textAlign: 'left', lineHeight: 1.7 }}>
        <strong>What happens next?</strong><br />
        1. We review your image for print quality (within 24h)<br />
        2. If adjustments are needed, we contact you by email<br />
        3. We print your edible sheet and ship via Canada Post<br />
        4. You receive it at your door!
      </div>
      <a href="/" style={{ display: 'inline-block', background: '#1B6B4A', color: '#fff', borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
        Back to Home
      </a>
      <p style={{ marginTop: 20, fontSize: 12, color: '#bbb' }}>Questions? Email glenj.belmar@gmail.com</p>
    </>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', fontFamily: 'sans-serif', color: '#6B7280' }}>Verifying payment…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
